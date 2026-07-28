import type { UseChatHelpers } from "@ai-sdk/react"
import type { QueryClient } from "@tanstack/react-query"
import type { ChatOnDataCallback, ChatOnFinishCallback } from "ai"
import { useCallback, useRef, useState } from "react"

import { issueKeys } from "@/features/issues"
import { apiClient } from "@/lib/api-client"

import { cancelAgentRun } from "../api"
import type {
  AgentComposerHandle,
  AgentComposerSnapshot,
} from "../components/agent-composer/agent-composer"
import type { useAgentThreadRuntimeState } from "../components/runtime-state/runtime-state"
import { agentKeys } from "../queries"
import type { AgentChatMessage } from "../schema"
import { hasComposerContent } from "./agent-controller-support"

type AgentThreadRuntime = ReturnType<typeof useAgentThreadRuntimeState>
type CancelOutcome = "canceled" | "completed" | "failed" | "expired" | "error"
type StopAttempt = {
  promise: Promise<boolean>
  resolve: (settled: boolean) => void
}
type ChatControls = Pick<
  UseChatHelpers<AgentChatMessage>,
  "clearError" | "stop"
>
type FinishEvent = Parameters<ChatOnFinishCallback<AgentChatMessage>>[0]

const ignoreStopResolution = (_settled: boolean) => undefined
const initialChatControls: ChatControls = {
  clearError: () => undefined,
  stop: () => Promise.resolve(),
}
const invalidateAgentQueries = (
  queryClient: QueryClient,
  organizationId: string,
  threadId: string
) =>
  Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: agentKeys.messages(organizationId, threadId),
    }),
    queryClient.invalidateQueries({
      queryKey: agentKeys.threads(organizationId),
    }),
    queryClient.invalidateQueries({ queryKey: issueKeys.all }),
  ]).then(() => undefined)

const createStopAttempt = () => {
  let resolveAttempt: (settled: boolean) => void = ignoreStopResolution
  const promise = new Promise<boolean>((resolve) => {
    resolveAttempt = resolve
  })
  return { promise, resolve: resolveAttempt }
}

export const useAgentStopLifecycle = ({
  busyRef,
  composerRef,
  organizationId,
  pendingComposerSnapshotRef,
  pendingSubmissionRef,
  queryClient,
  runtime,
  setSendingAssetIds,
  setTransientStatus,
  threadId,
}: {
  busyRef: { current: boolean }
  composerRef: { current: AgentComposerHandle | null }
  organizationId: string
  pendingComposerSnapshotRef: {
    current: AgentComposerSnapshot | undefined
  }
  pendingSubmissionRef: { current: AgentThreadRuntime["pendingSubmission"] }
  queryClient: QueryClient
  runtime: AgentThreadRuntime
  setSendingAssetIds: (assetIds: string[]) => void
  setTransientStatus: (status?: string) => void
  threadId: string
}) => {
  const [turnStopped, setTurnStopped] = useState(false)
  const [cancelState, setCancelState] = useState<
    "idle" | "canceling" | "failed"
  >("idle")
  const activeRunIdRef = useRef<string | undefined>(undefined)
  const cancelRequestedRef = useRef(false)
  const cancelRequestRef = useRef<Promise<void> | undefined>(undefined)
  const finalizingStopRef = useRef(false)
  const localStopRef = useRef<Promise<void> | undefined>(undefined)
  const stopAttemptRef = useRef<StopAttempt | undefined>(undefined)
  const stopDeadlineRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const chatControlsRef = useRef<ChatControls>(initialChatControls)

  const cancelKnownRun = useCallback(
    async (runId: string) => {
      try {
        const result = await cancelAgentRun(apiClient, { runId, threadId })
        if (result.status === "canceled") {
          return "canceled" satisfies CancelOutcome
        }
        if (
          result.status === "completed" ||
          result.status === "failed" ||
          result.status === "expired"
        ) {
          return result.status satisfies CancelOutcome
        }
        if (
          result.status === "running" ||
          result.status === "waiting_approval"
        ) {
          throw new Error("Agent run did not cancel")
        }
        throw new Error("Agent run returned an unsupported status")
      } catch {
        activeRunIdRef.current = runId
        setCancelState("failed")
        return "error" satisfies CancelOutcome
      }
    },
    [threadId]
  )
  const ensureLocalStop = useCallback(() => {
    if (!localStopRef.current) {
      localStopRef.current = chatControlsRef.current
        .stop()
        .catch(() => undefined)
    }
    return localStopRef.current
  }, [])
  const restorePendingDraft = useCallback(() => {
    const snapshot = pendingComposerSnapshotRef.current
    const currentComposer = composerRef.current?.snapshot()
    if (snapshot && currentComposer && !hasComposerContent(currentComposer)) {
      composerRef.current?.restore(snapshot)
    }
  }, [composerRef, pendingComposerSnapshotRef])
  const invalidateAgentState = useCallback(
    () => invalidateAgentQueries(queryClient, organizationId, threadId),
    [organizationId, queryClient, threadId]
  )
  const finalizeStop = useCallback(
    async (outcome: CancelOutcome) => {
      if (!cancelRequestedRef.current || finalizingStopRef.current) return
      finalizingStopRef.current = true
      if (stopDeadlineRef.current) {
        clearTimeout(stopDeadlineRef.current)
        stopDeadlineRef.current = undefined
      }
      if (outcome !== "completed") restorePendingDraft()
      if (outcome === "canceled" || outcome === "completed") {
        pendingSubmissionRef.current = undefined
        runtime.setPendingSubmission(undefined)
        runtime.clearStagedAssetsAfterSend()
        pendingComposerSnapshotRef.current = undefined
      }
      setSendingAssetIds([])
      setTransientStatus(undefined)
      setTurnStopped(outcome === "canceled")
      await ensureLocalStop()
      const settled = outcome !== "error"
      if (settled) {
        cancelRequestedRef.current = false
        activeRunIdRef.current = undefined
        localStopRef.current = undefined
        setCancelState("idle")
      } else if (!activeRunIdRef.current) {
        cancelRequestedRef.current = false
        localStopRef.current = undefined
        setCancelState("idle")
      } else {
        setCancelState("failed")
      }
      const stopAttempt = stopAttemptRef.current
      stopAttemptRef.current = undefined
      finalizingStopRef.current = false
      stopAttempt?.resolve(settled)
      if (outcome === "canceled" || outcome === "completed") {
        void invalidateAgentState()
      }
    },
    [
      ensureLocalStop,
      invalidateAgentState,
      pendingComposerSnapshotRef,
      pendingSubmissionRef,
      restorePendingDraft,
      runtime,
      setSendingAssetIds,
      setTransientStatus,
    ]
  )
  const requestAuthoritativeCancel = useCallback(
    (runId: string) => {
      if (cancelRequestRef.current) return cancelRequestRef.current
      const request = cancelKnownRun(runId)
        .then((outcome) => {
          if (cancelRequestRef.current === request)
            cancelRequestRef.current = undefined
          return finalizeStop(outcome)
        })
        .finally(() => {
          if (cancelRequestRef.current === request)
            cancelRequestRef.current = undefined
        })
      cancelRequestRef.current = request
      return request
    },
    [cancelKnownRun, finalizeStop]
  )
  const onData = useCallback<ChatOnDataCallback<AgentChatMessage>>(
    (dataPart) => {
      if (dataPart.type === "data-run") {
        activeRunIdRef.current = dataPart.data.runId
        if (cancelRequestedRef.current) {
          void requestAuthoritativeCancel(dataPart.data.runId)
        }
      } else if (dataPart.type === "data-activity") {
        setTransientStatus(
          dataPart.data.status === "running" ? dataPart.data.label : undefined
        )
      }
    },
    [requestAuthoritativeCancel, setTransientStatus]
  )
  const onError = useCallback(() => {
    if (!cancelRequestedRef.current) activeRunIdRef.current = undefined
    setTransientStatus(undefined)
  }, [setTransientStatus])
  const interceptFinish = useCallback(
    (event: FinishEvent) => {
      if (finalizingStopRef.current) return true
      if (!cancelRequestedRef.current) {
        activeRunIdRef.current = undefined
        return false
      }
      if (!activeRunIdRef.current) {
        const outcome: CancelOutcome =
          event.isDisconnect || event.isError || event.isAbort
            ? "error"
            : "completed"
        void finalizeStop(outcome)
      }
      return true
    },
    [finalizeStop]
  )
  const stopCurrentTurn = useCallback((): Promise<boolean> => {
    if (stopAttemptRef.current) return stopAttemptRef.current.promise
    if (!busyRef.current && !activeRunIdRef.current && cancelState !== "failed")
      return Promise.resolve(true)
    if (
      cancelState === "failed" &&
      !activeRunIdRef.current &&
      !cancelRequestedRef.current
    )
      return Promise.resolve(false)
    const stopAttempt = createStopAttempt()
    stopAttemptRef.current = stopAttempt
    const runId = activeRunIdRef.current
    cancelRequestedRef.current = true
    setCancelState("canceling")
    chatControlsRef.current.clearError()
    setTransientStatus(undefined)
    if (!runId) {
      stopDeadlineRef.current = setTimeout(() => {
        void finalizeStop("error")
      }, 5_000)
      return stopAttempt.promise
    }
    void requestAuthoritativeCancel(runId)
    return stopAttempt.promise
  }, [
    busyRef,
    cancelState,
    finalizeStop,
    requestAuthoritativeCancel,
    setTransientStatus,
  ])
  const beginTurn = useCallback(() => {
    activeRunIdRef.current = undefined
    setTurnStopped(false)
  }, [])
  const bindChat = useCallback((chat: ChatControls) => {
    chatControlsRef.current = chat
  }, [])
  const isCancelRequested = useCallback(() => cancelRequestedRef.current, [])

  return {
    beginTurn,
    bindChat,
    cancelState,
    ensureLocalStop,
    interceptFinish,
    isCancelRequested,
    onData,
    onError,
    stopCurrentTurn,
    turnStopped,
  }
}
