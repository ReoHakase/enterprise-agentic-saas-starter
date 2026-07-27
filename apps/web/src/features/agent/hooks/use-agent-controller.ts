"use client"

import { useChat, type UseChatHelpers } from "@ai-sdk/react"
import { agentClientToolNames } from "@enterprise-agentic-saas/api/client"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useQueryClient } from "@tanstack/react-query"
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatOnFinishCallback,
  type ChatOnToolCallCallback,
} from "ai"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
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
  resolveAgentSubmissionIdentity,
  shouldRetainAgentSubmission,
} from "../submission-identity"
import { useAgentMentionCandidates } from "./use-agent-mention-candidates"

const closeHttpChatSession = () => undefined
const hasComposerContent = (snapshot: AgentComposerSnapshot) =>
  snapshot.parts.some(
    (part) =>
      part.type === "data-context-reference" ||
      (part.type === "text" && part.text.trim().length > 0)
  )

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
  const chat = useChat<AgentChatMessage>({
    id: thread.id,
    messages: initialMessages,
    transport,
    onToolCall: handleToolCall,
    onData: (dataPart) => {
      if (dataPart.type !== "data-activity") return
      setTransientStatus(
        dataPart.data.status === "running" ? dataPart.data.label : undefined
      )
    },
    onError: () => setTransientStatus(undefined),
    onFinish: finishChat,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })
  addToolOutputRef.current = chat.addToolOutput
  const actionIds = useMemo(
    () => extractPendingActionIds(chat.messages),
    [chat.messages]
  )
  const busyRef = useRef(false)
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
  const stopChat = chat.stop
  const registerSession = runtime.registerSession
  useEffect(
    () =>
      registerSession({
        close: closeHttpChatSession,
        stop: () => void stopChat(),
        isBusy: () => busyRef.current,
        hasPendingApprovals: () => approvalsRef.current,
      }),
    [registerSession, stopChat]
  )
  const stopCurrentTurn = useCallback(() => void stopChat(), [stopChat])
  const submitMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (
        disabled ||
        runtime.frozen ||
        busyRef.current ||
        runtime.uploadingCount > 0
      )
        return
      const composer = composerRef.current
      if (!composer) return
      const snapshot = composer.snapshot()
      const assets = runtime.stagedAssets.map(({ asset }) => ({
        id: asset.id,
        filename: asset.filename,
        sizeBytes: asset.sizeBytes,
        imageWidth: asset.imageWidth,
        imageHeight: asset.imageHeight,
        expiresAt: asset.expiresAt,
      }))
      if (!hasComposerContent(snapshot) && assets.length === 0) return
      const contentParts = hasComposerContent(snapshot)
        ? snapshot.parts
        : [
            {
              type: "text" as const,
              text: "Please review the attached images.",
            },
          ]
      const assetIds = assets.map((asset) => asset.id)
      const fingerprint = JSON.stringify([contentParts, assetIds])
      const submission = resolveAgentSubmissionIdentity(
        pendingSubmissionRef.current,
        fingerprint,
        () => crypto.randomUUID()
      )
      pendingSubmissionRef.current = submission.pending
      runtime.setPendingSubmission(submission.pending)
      pendingComposerSnapshotRef.current = snapshot
      composer.clear()
      runtime.setComposer("")
      setSendingAssetIds(assetIds)
      try {
        await chat.sendMessage({
          id: submission.id,
          role: "user",
          parts: [
            ...contentParts,
            ...(assets.length > 0
              ? [
                  {
                    type: "data-agent-assets" as const,
                    data: { assetIds, assets },
                  },
                ]
              : []),
          ],
          messageId: submission.retrying ? submission.id : undefined,
        })
      } catch {
        setTransientStatus(undefined)
        setSendingAssetIds([])
        const current = composerRef.current?.snapshot()
        if (current && !hasComposerContent(current)) {
          composerRef.current?.restore(snapshot)
        }
        toast.error("The message could not be sent. Your local draft was kept.")
      }
    },
    [chat, disabled, runtime]
  )
  const attachImages = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])]
      event.target.value = ""
      if (files.length === 0) return
      void runtime.uploadImages(files).catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Image upload failed."
        )
      })
    },
    [runtime]
  )
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
    busy: busyRef.current,
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
  }
}
