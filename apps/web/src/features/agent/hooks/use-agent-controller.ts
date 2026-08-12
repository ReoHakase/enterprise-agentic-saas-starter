"use client"

import { useChat, type UseChatHelpers } from "@ai-sdk/react"
import { agentClientToolNames } from "@enterprise-agentic-saas/api/client"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import type { ChatOnFinishCallback, ChatOnToolCallCallback } from "ai"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { issueKeys } from "@/features/issues"
import { useIssueSearchState } from "@/features/issues/search-params.client"
import { clientEnv } from "@/lib/env.client"
import { reportObservedError } from "@/lib/report-observed-error"

import { createAgentChatTransport } from "../chat-transport"
import { executeAgentClientTool } from "../client-tools"
import type {
  AgentComposerHandle,
  AgentComposerSnapshot,
} from "../components/agent-composer/agent-composer"
import { useAgentFormRegistry } from "../components/form-registry/form-registry"
import { useAgentThreadRuntimeState } from "../components/runtime-state/runtime-state"
import { isAgentHotkeyAllowed } from "../hotkey-scope"
import { extractPendingActionIds } from "../pending-action-ids"
import { agentKeys } from "../queries"
import { type AgentChatMessage, type AgentThread } from "../schema"
import {
  shouldAutoContinueAgentClientTools,
  shouldRetainAgentSubmission,
} from "../submission-identity"
import { hasComposerContent } from "./agent-controller-support"
import { useAgentMentionCandidates } from "./use-agent-mention-candidates"
import { useAgentStopLifecycle } from "./use-agent-stop-lifecycle"
import { useAgentSubmission } from "./use-agent-submission"

const closeHttpChatSession = () => undefined
const DEFAULT_AGENT_THREAD_TITLE = "New conversation"
const THREAD_TITLE_REFRESH_DELAYS_MS = [500, 1_500, 3_000, 5_000, 10_000]

type AgentThreadRuntime = ReturnType<typeof useAgentThreadRuntimeState>
type AgentClientToolName = (typeof agentClientToolNames)[number]

const isAgentClientToolName = (value: string): value is AgentClientToolName =>
  agentClientToolNames.some((name) => name === value)

const waitForThreadTitleRefresh = (
  delayMs: number,
  signal: AbortSignal
): Promise<boolean> => {
  if (signal.aborted) return Promise.resolve(false)
  let timeout: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const delay = new Promise<true>((resolve) => {
    timeout = setTimeout(() => resolve(true), delayMs)
  })
  const abort = new Promise<false>((resolve) => {
    onAbort = () => resolve(false)
    signal.addEventListener("abort", onAbort, { once: true })
  })
  return Promise.race([delay, abort]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
    if (onAbort) signal.removeEventListener("abort", onAbort)
  })
}

const useAgentThreadTitleRefresh = ({
  organizationId,
  queryClient,
  thread,
}: {
  organizationId: string
  queryClient: QueryClient
  thread: AgentThread
}) => {
  const refreshControllerRef = useRef<AbortController | undefined>(undefined)
  useEffect(
    () => () => {
      refreshControllerRef.current?.abort()
    },
    [thread.id]
  )
  return useCallback(() => {
    if (thread.title !== DEFAULT_AGENT_THREAD_TITLE) return
    refreshControllerRef.current?.abort()
    const refreshController = new AbortController()
    refreshControllerRef.current = refreshController
    const queryKey = agentKeys.threads(organizationId)
    void (async () => {
      for (const delayMs of THREAD_TITLE_REFRESH_DELAYS_MS) {
        const currentThreads = queryClient.getQueryData<AgentThread[]>(queryKey)
        const currentThread = currentThreads?.find(
          (candidate) => candidate.id === thread.id
        )
        if (
          !currentThread ||
          currentThread.title !== DEFAULT_AGENT_THREAD_TITLE
        )
          return
        // oxlint-disable-next-line no-await-in-loop -- Title generation is asynchronous and retries are bounded.
        const ready = await waitForThreadTitleRefresh(
          delayMs,
          refreshController.signal
        )
        if (!ready) return
        // oxlint-disable-next-line no-await-in-loop -- Each refetch observes the previous title state.
        await queryClient.invalidateQueries({ queryKey })
      }
    })()
  }, [organizationId, queryClient, thread.id, thread.title])
}

const useAgentToolCall = ({
  disabled,
  formRegistry,
  issueSearchState,
  navigate,
  organizationId,
  organizationSlug,
  runtime,
}: {
  disabled: boolean
  formRegistry: ReturnType<typeof useAgentFormRegistry>
  issueSearchState: ReturnType<typeof useIssueSearchState>["state"]
  navigate: ReturnType<typeof useRouter>["push"]
  organizationId: string
  organizationSlug: string
  runtime: AgentThreadRuntime
}) => {
  const addToolOutputRef = useRef<
    UseChatHelpers<AgentChatMessage>["addToolOutput"] | undefined
  >(undefined)
  const handleToolCall = useCallback<ChatOnToolCallCallback<AgentChatMessage>>(
    async ({ toolCall }) => {
      const addToolOutput = addToolOutputRef.current
      if (!addToolOutput) return
      if (!isAgentClientToolName(toolCall.toolName)) return
      const toolName = toolCall.toolName
      try {
        const output = await executeAgentClientTool(toolName, toolCall.input, {
          organizationId,
          organizationSlug,
          frozen: runtime.frozen || disabled,
          navigate,
          issueSearchState,
          readForm: formRegistry.read,
          patchForm: formRegistry.patch,
        })
        void addToolOutput({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          output,
        })
      } catch (error) {
        reportObservedError(error)
        void addToolOutput({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: "Client tool failed.",
        })
      }
    },
    [
      disabled,
      formRegistry,
      issueSearchState,
      navigate,
      organizationId,
      organizationSlug,
      runtime.frozen,
    ]
  )
  return { addToolOutputRef, handleToolCall }
}

const useAgentChatFinish = ({
  composerRef,
  organizationId,
  pendingComposerSnapshotRef,
  pendingSubmissionRef,
  queryClient,
  refreshThreadTitle,
  runtime,
  setSendingAssetIds,
  threadId,
}: {
  composerRef: { current: AgentComposerHandle | null }
  organizationId: string
  pendingComposerSnapshotRef: {
    current: AgentComposerSnapshot | undefined
  }
  pendingSubmissionRef: { current: AgentThreadRuntime["pendingSubmission"] }
  queryClient: ReturnType<typeof useQueryClient>
  refreshThreadTitle: () => void
  runtime: AgentThreadRuntime
  setSendingAssetIds: (assetIds: string[]) => void
  threadId: string
}) =>
  useCallback<ChatOnFinishCallback<AgentChatMessage>>(
    ({ isAbort, isDisconnect, isError }) => {
      if (shouldRetainAgentSubmission({ isAbort, isDisconnect, isError })) {
        setSendingAssetIds([])
        const failedSnapshot = pendingComposerSnapshotRef.current
        const currentSnapshot = composerRef.current?.snapshot()
        if (
          failedSnapshot &&
          currentSnapshot &&
          !hasComposerContent(currentSnapshot)
        ) {
          composerRef.current?.restore(failedSnapshot)
        }
        if (pendingSubmissionRef.current) {
          toast.error(
            isAbort
              ? "The Agent response was stopped. Your local draft was kept."
              : "The Agent response failed. Your local draft was kept."
          )
        }
        return
      }
      if (pendingSubmissionRef.current) {
        pendingSubmissionRef.current = undefined
        runtime.setPendingSubmission(undefined)
        runtime.clearStagedAssetsAfterSend()
        pendingComposerSnapshotRef.current = undefined
        setSendingAssetIds([])
      }
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: agentKeys.messages(organizationId, threadId),
        }),
        queryClient.invalidateQueries({
          queryKey: agentKeys.threads(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.all,
        }),
      ]).then(refreshThreadTitle)
    },
    [
      composerRef,
      organizationId,
      pendingComposerSnapshotRef,
      pendingSubmissionRef,
      queryClient,
      refreshThreadTitle,
      runtime,
      setSendingAssetIds,
      threadId,
    ]
  )

const useAutoSubmitAgentMessage = (
  autoSubmit: boolean,
  composerFormRef: { current: HTMLFormElement | null },
  onAutoSubmit: () => void
) => {
  useEffect(() => {
    if (!autoSubmit) return
    const frame = requestAnimationFrame(() => {
      composerFormRef.current?.requestSubmit()
      onAutoSubmit()
    })
    return () => cancelAnimationFrame(frame)
  }, [autoSubmit, composerFormRef, onAutoSubmit])
}

export const useAgentController = ({
  organizationId,
  organizationSlug,
  thread,
  disabled,
  initialMessages,
  autoSubmit,
  onAutoSubmit,
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
  disabled: boolean
  initialMessages: AgentChatMessage[]
  autoSubmit: boolean
  onAutoSubmit: () => void
}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const formRegistry = useAgentFormRegistry()
  const { state: issueSearchState } = useIssueSearchState()
  const runtime = useAgentThreadRuntimeState(thread.id)
  const composerRef = useRef<AgentComposerHandle>(null)
  const composerFormRef = useRef<HTMLFormElement>(null)
  const pendingComposerSnapshotRef = useRef<AgentComposerSnapshot | undefined>(
    undefined
  )
  const [sendingAssetIds, setSendingAssetIds] = useState<string[]>([])
  const busyRef = useRef(false)
  const mentionCandidates = useAgentMentionCandidates(organizationId)
  const transport = useMemo(
    () =>
      createAgentChatTransport({
        apiBaseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
        threadId: thread.id,
      }),
    [thread.id]
  )
  const pendingSubmissionRef = useRef(runtime.pendingSubmission)
  useEffect(() => {
    pendingSubmissionRef.current = runtime.pendingSubmission
  }, [runtime.pendingSubmission])
  const refreshThreadTitle = useAgentThreadTitleRefresh({
    organizationId,
    queryClient,
    thread,
  })
  const { addToolOutputRef, handleToolCall } = useAgentToolCall({
    disabled,
    formRegistry,
    issueSearchState,
    navigate: router.push,
    organizationId,
    organizationSlug,
    runtime,
  })
  const finishChat = useAgentChatFinish({
    composerRef,
    organizationId,
    pendingComposerSnapshotRef,
    pendingSubmissionRef,
    queryClient,
    refreshThreadTitle,
    runtime,
    setSendingAssetIds,
    threadId: thread.id,
  })
  const stopLifecycle = useAgentStopLifecycle({
    busyRef,
    composerRef,
    organizationId,
    pendingComposerSnapshotRef,
    pendingSubmissionRef,
    queryClient,
    runtime,
    setSendingAssetIds,
    threadId: thread.id,
  })
  const {
    ensureLocalStop,
    isCancelRequested,
    observeMessages,
    stopCurrentTurn,
  } = stopLifecycle
  const chat = useChat<AgentChatMessage>({
    id: thread.id,
    messages: initialMessages,
    transport,
    onToolCall: handleToolCall,
    onError: stopLifecycle.onError,
    onFinish: (event) => {
      if (stopLifecycle.interceptFinish(event)) return
      finishChat(event)
    },
    sendAutomaticallyWhen: shouldAutoContinueAgentClientTools,
  })
  stopLifecycle.bindChat(chat)
  useEffect(() => {
    addToolOutputRef.current = chat.addToolOutput
  }, [addToolOutputRef, chat.addToolOutput])
  // Message observation reports the latest chat state to the controller boundary.
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-pass-data-to-parent
    observeMessages(chat.messages)
  }, [chat.messages, observeMessages])
  useEffect(() => {
    if (stopLifecycle.turnStopped && chat.error) chat.clearError()
  }, [chat, stopLifecycle.turnStopped])
  const actionIds = useMemo(
    () => extractPendingActionIds(chat.messages),
    [chat.messages]
  )
  const approvalsRef = useRef(false)
  const approvalStatesRef = useRef(new Map<string, boolean>())
  const actionIdSet = useMemo(() => new Set(actionIds), [actionIds])
  useEffect(() => {
    for (const actionId of approvalStatesRef.current.keys()) {
      if (!actionIdSet.has(actionId)) approvalStatesRef.current.delete(actionId)
    }
    busyRef.current = chat.status === "streaming" || chat.status === "submitted"
    approvalsRef.current = actionIds.some(
      (actionId) => approvalStatesRef.current.get(actionId) ?? true
    )
  }, [actionIdSet, actionIds, chat.status])
  const reportApprovalState = useCallback(
    (actionId: string, pending: boolean) => {
      approvalStatesRef.current.set(actionId, pending)
      approvalsRef.current = actionIds.some(
        (candidateId) => approvalStatesRef.current.get(candidateId) ?? true
      )
    },
    [actionIds]
  )
  const registerSession = runtime.registerSession
  useEffect(
    () =>
      registerSession({
        abortTransport: () => {
          void ensureLocalStop()
        },
        close: closeHttpChatSession,
        stop: stopCurrentTurn,
        isBusy: () => busyRef.current || isCancelRequested(),
        hasPendingApprovals: () => approvalsRef.current,
      }),
    [registerSession, ensureLocalStop, isCancelRequested, stopCurrentTurn]
  )
  const { attachImages, submitMessage } = useAgentSubmission({
    beginTurn: stopLifecycle.beginTurn,
    busyRef,
    cancelState: stopLifecycle.cancelState,
    composerRef,
    disabled,
    pendingComposerSnapshotRef,
    pendingSubmissionRef,
    runtime,
    sendMessage: chat.sendMessage,
    setSendingAssetIds,
  })
  useAutoSubmitAgentMessage(autoSubmit, composerFormRef, onAutoSubmit)
  useHotkeys(
    [
      {
        hotkey: "Mod+.",
        callback: (event) => {
          if (isAgentHotkeyAllowed(event) && busyRef.current) stopCurrentTurn()
        },
        options: { enabled: busyRef.current },
      },
    ],
    {
      conflictBehavior: "allow",
      meta: { name: "Agent composer", description: "Send or stop Agent" },
    }
  )

  return {
    attachImages,
    busy: busyRef.current || stopLifecycle.cancelState !== "idle",
    cancelState: stopLifecycle.cancelState,
    chat,
    composerFormRef,
    composerRef,
    mentionCandidates,
    reportApprovalState,
    runtime,
    sendingAssetIds,
    stopCurrentTurn,
    submitMessage,
    turnStopped: stopLifecycle.turnStopped,
  }
}
