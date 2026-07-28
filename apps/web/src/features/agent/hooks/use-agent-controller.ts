"use client"

import { useChat, type UseChatHelpers } from "@ai-sdk/react"
import { agentClientToolNames } from "@enterprise-agentic-saas/api/client"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useQueryClient } from "@tanstack/react-query"
import type { ChatOnFinishCallback, ChatOnToolCallCallback } from "ai"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { issueKeys, useIssueSearchState } from "@/features/issues"
import { clientEnv } from "@/lib/env.client"

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

type AgentThreadRuntime = ReturnType<typeof useAgentThreadRuntimeState>
type AgentClientToolName = (typeof agentClientToolNames)[number]

const isAgentClientToolName = (value: string): value is AgentClientToolName =>
  agentClientToolNames.some((name) => name === value)

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
        const errorText =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Client tool failed."
        void addToolOutput({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: errorText.slice(0, 500),
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
  runtime,
  setSendingAssetIds,
  setTransientStatus,
  threadId,
}: {
  composerRef: { current: AgentComposerHandle | null }
  organizationId: string
  pendingComposerSnapshotRef: {
    current: AgentComposerSnapshot | undefined
  }
  pendingSubmissionRef: { current: AgentThreadRuntime["pendingSubmission"] }
  queryClient: ReturnType<typeof useQueryClient>
  runtime: AgentThreadRuntime
  setSendingAssetIds: (assetIds: string[]) => void
  setTransientStatus: (status?: string) => void
  threadId: string
}) =>
  useCallback<ChatOnFinishCallback<AgentChatMessage>>(
    ({ isAbort, isDisconnect, isError }) => {
      setTransientStatus(undefined)
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
      ])
    },
    [
      composerRef,
      organizationId,
      pendingComposerSnapshotRef,
      pendingSubmissionRef,
      queryClient,
      runtime,
      setSendingAssetIds,
      setTransientStatus,
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
  const [transientStatus, setTransientStatus] = useState<string>()
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
  pendingSubmissionRef.current = runtime.pendingSubmission
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
    runtime,
    setSendingAssetIds,
    setTransientStatus,
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
    setTransientStatus,
    threadId: thread.id,
  })
  const { ensureLocalStop, isCancelRequested, stopCurrentTurn } = stopLifecycle
  const chat = useChat<AgentChatMessage>({
    id: thread.id,
    messages: initialMessages,
    transport,
    onToolCall: handleToolCall,
    onData: stopLifecycle.onData,
    onError: stopLifecycle.onError,
    onFinish: (event) => {
      if (stopLifecycle.interceptFinish(event)) return
      finishChat(event)
    },
    sendAutomaticallyWhen: shouldAutoContinueAgentClientTools,
  })
  stopLifecycle.bindChat(chat)
  useEffect(() => {
    if (stopLifecycle.turnStopped && chat.error) chat.clearError()
  }, [chat, stopLifecycle.turnStopped])
  addToolOutputRef.current = chat.addToolOutput
  const actionIds = useMemo(
    () => extractPendingActionIds(chat.messages),
    [chat.messages]
  )
  const approvalsRef = useRef(false)
  const approvalStatesRef = useRef(new Map<string, boolean>())
  for (const actionId of approvalStatesRef.current.keys()) {
    if (!actionIds.includes(actionId))
      approvalStatesRef.current.delete(actionId)
  }
  busyRef.current = chat.status === "streaming" || chat.status === "submitted"
  approvalsRef.current = actionIds.some(
    (actionId) => approvalStatesRef.current.get(actionId) ?? true
  )
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
    setTransientStatus,
  })
  useAutoSubmitAgentMessage(autoSubmit, composerFormRef, onAutoSubmit)
  useHotkeys(
    [
      {
        hotkey: "Mod+Enter",
        callback: (event) => {
          if (isAgentHotkeyAllowed(event))
            composerFormRef.current?.requestSubmit()
        },
        options: {
          enabled:
            !disabled &&
            !runtime.frozen &&
            runtime.uploadingCount === 0 &&
            !busyRef.current,
          ignoreInputs: false,
        },
      },
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
    transientStatus,
    turnStopped: stopLifecycle.turnStopped,
  }
}
