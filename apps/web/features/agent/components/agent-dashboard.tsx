"use client"

import { useChat, type UseChatHelpers } from "@ai-sdk/react"
import {
  buildAgentAssetPreviewUrl,
  FILE_PREVIEW_WIDTHS,
} from "@enterprise-agentic-saas/api/client"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatOnFinishCallback,
  type ChatOnToolCallCallback,
  type UIMessage,
} from "ai"
import {
  ArchiveIcon,
  ImagePlusIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  SendIcon,
  StopCircleIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
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
import * as v from "valibot"

import { MessageResponse } from "@/components/ai-elements/message"
import { LocalDate } from "@/components/local-date"
import {
  archiveAgentThread,
  createAgentThread,
  deleteAgentApprovalPolicy,
  decideAgentAction,
  putAgentApprovalPolicy,
  resumeAgentAction,
} from "@/features/agent/api"
import { createAgentChatTransport } from "@/features/agent/chat-transport"
import { executeAgentClientTool } from "@/features/agent/client-tools"
import { useAgentFormRegistry } from "@/features/agent/form-registry"
import {
  agentActionQueryOptions,
  agentApprovalPolicyQueryOptions,
  agentKeys,
  agentMessagesQueryOptions,
  agentThreadsQueryOptions,
} from "@/features/agent/queries"
import {
  hasBlockingThreadSwitchRisks,
  useAgentRuntimeState,
  useAgentThreadRuntimeState,
  type AgentThreadSwitchRisks,
  type StagedAgentAsset,
} from "@/features/agent/runtime-state"
import {
  pendingActionToolOutputSchema,
  type AgentChatMessage,
  type AgentIssueAction,
  type AgentThread,
} from "@/features/agent/schema"
import {
  resolveAgentSubmissionIdentity,
  shouldRetainAgentSubmission,
} from "@/features/agent/submission-identity"
import { issueKeys } from "@/features/issues/queries"
import { useIssueSearchState } from "@/features/issues/search-params"
import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

const attachmentButtonRender = <span />
const emptyAgentThreads: AgentThread[] = []
const closeHttpChatSession = () => undefined

export const extractPendingActionIds = (messages: UIMessage[]) => {
  const ids = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue
      const parsed = v.safeParse(pendingActionToolOutputSchema, part.output)
      if (parsed.success) ids.add(parsed.output.actionId)
    }
  }
  return [...ids]
}

type PendingThreadTransition =
  | {
      kind: "switch"
      sourceThreadId: string
      targetThreadId: string
      risks: AgentThreadSwitchRisks
    }
  | {
      kind: "archive"
      thread: AgentThread
      risks: AgentThreadSwitchRisks
    }

export const AgentDashboard = ({
  organizationId,
  organizationSlug,
  presentation = "page",
  disabled = false,
}: {
  organizationId: string
  organizationSlug: string
  presentation?: "page" | "shell"
  disabled?: boolean
}) => {
  const queryClient = useQueryClient()
  const runtime = useAgentRuntimeState()
  const { state, setDiscrete } = useIssueSearchState()
  const [pendingTransition, setPendingTransition] =
    useState<PendingThreadTransition>()
  const threadsQuery = useQuery(
    agentThreadsQueryOptions(apiClient, organizationId)
  )
  const selectedThread = threadsQuery.data?.find(
    (thread) => thread.id === state.agentThread
  )
  const interactionDisabled = disabled || runtime.frozen
  const finishThreadSelection = useCallback(
    async (sourceThreadId: string, targetThreadId: string) => {
      try {
        await runtime.completeThreadSwitch(sourceThreadId, {
          discardDraft: false,
        })
        await setDiscrete({ agentThread: targetThreadId }, { history: "push" })
      } finally {
        runtime.cancelThreadSwitch()
      }
    },
    [runtime, setDiscrete]
  )
  const requestThreadSelection = useCallback(
    (targetThreadId: string) => {
      const sourceThreadId = selectedThread?.id
      if (sourceThreadId === targetThreadId) return
      if (!sourceThreadId) {
        void setDiscrete({ agentThread: targetThreadId }, { history: "push" })
        return
      }

      const risks = runtime.beginThreadSwitch(sourceThreadId)
      if (hasBlockingThreadSwitchRisks(risks)) {
        setPendingTransition({
          kind: "switch",
          sourceThreadId,
          targetThreadId,
          risks,
        })
        return
      }
      void finishThreadSelection(sourceThreadId, targetThreadId)
    },
    [finishThreadSelection, runtime, selectedThread?.id, setDiscrete]
  )
  const createThreadMutation = useMutation({
    mutationFn: () => createAgentThread(apiClient),
    onSuccess: async (thread) => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.threads(organizationId),
      })
      requestThreadSelection(thread.id)
    },
    onError: () => toast.error("The Agent thread could not be created."),
  })
  const archiveThreadMutation = useMutation({
    mutationFn: (threadId: string) => archiveAgentThread(apiClient, threadId),
    onSuccess: async (_, threadId) => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.threads(organizationId),
      })
      if (state.agentThread === threadId) {
        await setDiscrete({ agentThread: null }, { history: "replace" })
      }
    },
    onError: () =>
      toast.error(
        "The Agent thread could not be archived. Its discarded local draft cannot be restored."
      ),
    onSettled: () => runtime.cancelThreadSwitch(),
  })
  const { mutate: startThreadMutation, isPending: creatingThread } =
    createThreadMutation
  const { mutate: runArchiveThread, isPending: archivingThread } =
    archiveThreadMutation

  useEffect(() => {
    if (
      disabled ||
      !threadsQuery.data ||
      selectedThread ||
      state.agentThread === ""
    )
      return
    const missingThreadId = state.agentThread
    runtime.beginThreadSwitch(missingThreadId)
    void runtime
      .completeThreadSwitch(missingThreadId, { discardDraft: true })
      .then(() => setDiscrete({ agentThread: null }, { history: "replace" }))
      .finally(() => runtime.cancelThreadSwitch())
  }, [
    runtime,
    disabled,
    selectedThread,
    setDiscrete,
    state.agentThread,
    threadsQuery.data,
  ])

  const selectThread = useCallback(
    (threadId: string) => requestThreadSelection(threadId),
    [requestThreadSelection]
  )
  const startThread = useCallback(
    () => startThreadMutation(),
    [startThreadMutation]
  )
  const archiveThread = useCallback(
    (threadId: string) => {
      const thread = threadsQuery.data?.find(
        (candidate) => candidate.id === threadId
      )
      if (!thread) return
      const risks = runtime.beginThreadSwitch(threadId)
      setPendingTransition({ kind: "archive", thread, risks })
    },
    [runtime, threadsQuery.data]
  )
  const cancelThreadTransition = useCallback(() => {
    setPendingTransition(undefined)
    runtime.cancelThreadSwitch()
  }, [runtime])
  const confirmThreadTransition = useCallback(() => {
    const transition = pendingTransition
    if (!transition) return
    setPendingTransition(undefined)
    if (transition.kind === "switch") {
      void finishThreadSelection(
        transition.sourceThreadId,
        transition.targetThreadId
      )
      return
    }
    void runtime
      .completeThreadSwitch(transition.thread.id, { discardDraft: true })
      .then(() => runArchiveThread(transition.thread.id))
      .catch(() => {
        runtime.cancelThreadSwitch()
        toast.error("The local Agent thread draft could not be discarded.")
      })
  }, [finishThreadSelection, pendingTransition, runArchiveThread, runtime])
  const handleTransitionOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelThreadTransition()
    },
    [cancelThreadTransition]
  )

  return (
    <>
      <div
        className={cn(
          "min-w-0 gap-4",
          presentation === "shell"
            ? "flex min-h-0 flex-1 flex-col"
            : "grid min-h-136 lg:grid-cols-[15rem_minmax(0,1fr)]"
        )}
      >
        {presentation === "shell" ? (
          <AgentThreadToolbar
            threads={threadsQuery.data ?? emptyAgentThreads}
            selectedThread={selectedThread}
            loading={threadsQuery.isPending}
            error={threadsQuery.isError}
            creating={creatingThread}
            archiving={archivingThread}
            disabled={interactionDisabled}
            onSelect={selectThread}
            onCreate={startThread}
            onArchive={archiveThread}
          />
        ) : (
          <Card className="min-w-0">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>Private threads</CardTitle>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="New agent thread"
                disabled={creatingThread || interactionDisabled}
                onClick={startThread}
              >
                {creatingThread ? <Spinner /> : <MessageSquarePlusIcon />}
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {threadsQuery.data?.map((thread) => (
                <AgentThreadItem
                  key={thread.id}
                  thread={thread}
                  selected={thread.id === selectedThread?.id}
                  disabled={archivingThread || interactionDisabled}
                  onSelect={selectThread}
                  onArchive={archiveThread}
                />
              ))}
              {threadsQuery.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create a private thread to start working with the Issue agent.
                </p>
              ) : null}
              {threadsQuery.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  Agent threads could not be loaded.
                </p>
              ) : null}
              <p className="pt-2 text-xs text-muted-foreground">
                Unsent text and staged images stay with their thread. Archiving
                that thread discards the draft and deletes its temporary images.
              </p>
            </CardContent>
          </Card>
        )}

        {selectedThread ? (
          <ConnectedAgentChat
            key={selectedThread.id}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            thread={selectedThread}
            presentation={presentation}
            disabled={disabled}
          />
        ) : (
          <Card className="grid min-h-0 flex-1 place-items-center p-8 text-center">
            <div>
              <h2 className="font-semibold">Choose an Agent thread</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Threads are private to you and scoped to the active
                organization.
              </p>
            </div>
          </Card>
        )}
      </div>
      <AlertDialog
        open={pendingTransition !== undefined}
        onOpenChange={handleTransitionOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTransition?.kind === "archive"
                ? "Archive this Agent thread?"
                : "Switch Agent threads?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTransition?.kind === "archive"
                ? "Archiving permanently discards this thread's unsent text and staged images. Temporary images are deleted from storage, and any upload or active response is stopped."
                : "Unsent text and staged images stay with the current thread. In-progress uploads and the active response will stop; pending approvals stay with this thread."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelThreadTransition}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant={
                pendingTransition?.kind === "archive"
                  ? "destructive"
                  : "default"
              }
              onClick={confirmThreadTransition}
            >
              {pendingTransition?.kind === "archive"
                ? "Archive and discard"
                : "Stop and switch"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const AgentThreadToolbar = ({
  threads,
  selectedThread,
  loading,
  error,
  creating,
  archiving,
  disabled,
  onSelect,
  onCreate,
  onArchive,
}: {
  threads: AgentThread[]
  selectedThread?: AgentThread
  loading: boolean
  error: boolean
  creating: boolean
  archiving: boolean
  disabled: boolean
  onSelect: (threadId: string) => void
  onCreate: () => void
  onArchive: (threadId: string) => void
}) => {
  const items = useMemo(
    () => threads.map((thread) => ({ label: thread.title, value: thread.id })),
    [threads]
  )
  const selectThread = useCallback(
    (threadId: string | null) => {
      if (threadId) onSelect(threadId)
    },
    [onSelect]
  )
  const archiveThread = useCallback(() => {
    if (selectedThread) onArchive(selectedThread.id)
  }, [onArchive, selectedThread])

  return (
    <div className="shrink-0 space-y-2 rounded-xl border bg-card p-2">
      <div className="flex min-w-0 items-center gap-2">
        <Select
          items={items}
          value={selectedThread?.id ?? ""}
          disabled={disabled || loading || threads.length === 0}
          onValueChange={selectThread}
        >
          <SelectTrigger className="min-w-0 flex-1" aria-label="Agent thread">
            <MessageSquareIcon aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedThread?.title ??
                (loading ? "Loading threads…" : "Choose a private thread")}
            </span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {threads.map((thread) => (
                <SelectItem key={thread.id} value={thread.id}>
                  {thread.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="New agent thread"
          disabled={disabled || creating}
          onClick={onCreate}
        >
          {creating ? (
            <Spinner />
          ) : (
            <MessageSquarePlusIcon aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={
            selectedThread
              ? `Archive ${selectedThread.title}`
              : "Archive thread"
          }
          disabled={disabled || archiving || !selectedThread}
          onClick={archiveThread}
        >
          <ArchiveIcon aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          Agent threads could not be loaded.
        </p>
      ) : null}
      {!loading && !error && threads.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Create a private thread to start.
        </p>
      ) : null}
    </div>
  )
}

const AgentThreadItem = ({
  thread,
  selected,
  disabled,
  onSelect,
  onArchive,
}: {
  thread: AgentThread
  selected: boolean
  disabled: boolean
  onSelect: (threadId: string) => void
  onArchive: (threadId: string) => void
}) => {
  const select = useCallback(() => onSelect(thread.id), [onSelect, thread.id])
  const archive = useCallback(
    () => onArchive(thread.id),
    [onArchive, thread.id]
  )
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        className="min-w-0 flex-1 justify-start"
        variant={selected ? "secondary" : "ghost"}
        disabled={disabled}
        onClick={select}
      >
        <span className="truncate">{thread.title}</span>
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Archive ${thread.title}`}
        disabled={disabled}
        onClick={archive}
      >
        <ArchiveIcon />
      </Button>
    </div>
  )
}

const ConnectedAgentChat = ({
  organizationId,
  organizationSlug,
  thread,
  presentation,
  disabled,
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
  presentation: "page" | "shell"
  disabled: boolean
}) => {
  const messagesQuery = useQuery(
    agentMessagesQueryOptions(apiClient, organizationId, thread.id)
  )
  const { refetch: refetchMessages } = messagesQuery
  const retryHistory = useCallback(
    () => void refetchMessages(),
    [refetchMessages]
  )

  if (messagesQuery.isPending) {
    return (
      <Card className="grid min-h-0 flex-1 place-items-center p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading Agent history…
        </div>
      </Card>
    )
  }

  if (messagesQuery.isError) {
    return (
      <Card className="grid min-h-0 flex-1 place-items-center p-8 text-center">
        <div>
          <p role="alert" className="text-sm text-destructive">
            Agent history could not be loaded.
          </p>
          <Button className="mt-3" variant="outline" onClick={retryHistory}>
            Try again
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <AgentChatSession
      organizationId={organizationId}
      organizationSlug={organizationSlug}
      thread={thread}
      presentation={presentation}
      disabled={disabled}
      initialMessages={messagesQuery.data}
    />
  )
}

const AgentChatSession = ({
  organizationId,
  organizationSlug,
  thread,
  presentation,
  disabled,
  initialMessages,
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
  presentation: "page" | "shell"
  disabled: boolean
  initialMessages: AgentChatMessage[]
}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const formRegistry = useAgentFormRegistry()
  const { state: issueSearchState } = useIssueSearchState()
  const runtime = useAgentThreadRuntimeState(thread.id)
  const transport = useMemo(
    () =>
      createAgentChatTransport({
        apiBaseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
        threadId: thread.id,
      }),
    [thread.id]
  )
  const addToolOutputRef = useRef<
    UseChatHelpers<AgentChatMessage>["addToolOutput"] | undefined
  >(undefined)
  const pendingSubmissionRef = useRef(runtime.pendingSubmission)
  pendingSubmissionRef.current = runtime.pendingSubmission
  const handleToolCall = useCallback<ChatOnToolCallCallback<AgentChatMessage>>(
    async ({ toolCall }) => {
      const addToolOutput = addToolOutputRef.current
      if (!addToolOutput) return
      try {
        const output = await executeAgentClientTool(
          toolCall.toolName,
          toolCall.input,
          {
            organizationId,
            organizationSlug,
            frozen: runtime.frozen || disabled,
            navigate: router.push,
            issueSearchState,
            readForm: formRegistry.read,
            patchForm: formRegistry.patch,
          }
        )
        void addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        })
      } catch (error) {
        const errorText =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Client tool failed."
        void addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: errorText.slice(0, 500),
        })
      }
    },
    [
      formRegistry,
      organizationId,
      organizationSlug,
      router.push,
      runtime.frozen,
      disabled,
      issueSearchState,
    ]
  )
  const finishChat = useCallback<ChatOnFinishCallback<AgentChatMessage>>(
    ({ isAbort, isDisconnect, isError }) => {
      if (shouldRetainAgentSubmission({ isAbort, isDisconnect, isError })) {
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
        runtime.setComposer("")
        runtime.clearStagedAssetsAfterSend()
      }
      void queryClient.invalidateQueries({
        queryKey: agentKeys.messages(organizationId, thread.id),
      })
    },
    [organizationId, queryClient, runtime, thread.id]
  )
  const chat = useChat<AgentChatMessage>({
    id: thread.id,
    messages: initialMessages,
    transport,
    onToolCall: handleToolCall,
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
  const changeComposer = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      runtime.setComposer(event.target.value),
    [runtime]
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
      const text = runtime.composer.trim()
      const assets = runtime.stagedAssets.map(({ asset }) => ({
        id: asset.id,
        filename: asset.filename,
        sizeBytes: asset.sizeBytes,
        imageWidth: asset.imageWidth,
        imageHeight: asset.imageHeight,
        expiresAt: asset.expiresAt,
      }))
      if (!text && assets.length === 0) return
      const messageText = text || "Please review the attached images."
      const assetIds = assets.map((asset) => asset.id)
      const fingerprint = JSON.stringify([messageText, assetIds])
      const submission = resolveAgentSubmissionIdentity(
        pendingSubmissionRef.current,
        fingerprint,
        () => crypto.randomUUID()
      )
      pendingSubmissionRef.current = submission.pending
      runtime.setPendingSubmission(submission.pending)
      try {
        await chat.sendMessage({
          id: submission.id,
          role: "user",
          parts: [
            {
              type: "text",
              text: messageText,
            },
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

  return (
    <Card
      className={cn(
        "flex min-h-0 min-w-0 flex-col",
        presentation === "shell" && "flex-1"
      )}
    >
      <CardHeader
        className={cn("gap-3 border-b", presentation === "shell" && "p-3")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{thread.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Issue CRUD requires canonical approval unless a time-limited
              policy allows it.
            </p>
          </div>
          <AgentPolicyControl
            organizationId={organizationId}
            threadId={thread.id}
            disabled={disabled || runtime.frozen}
          />
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-4 pt-4",
          presentation === "shell" && "p-3"
        )}
      >
        {chat.error ? (
          <p role="alert" className="text-sm text-destructive">
            Agent response failed. You can retry the same draft safely.
          </p>
        ) : null}
        <div
          className="min-h-72 flex-1 space-y-4 overflow-y-auto"
          aria-live="polite"
        >
          {chat.messages.map((message) => (
            <AgentMessage
              key={message.id}
              message={message}
              organizationId={organizationId}
            />
          ))}
          {actionIds.map((actionId) => (
            <AgentApprovalCard
              key={actionId}
              actionId={actionId}
              organizationId={organizationId}
              frozen={runtime.frozen || disabled}
              onPendingChange={reportApprovalState}
            />
          ))}
        </div>

        {runtime.stagedAssets.length > 0 ? (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Images ready to send"
          >
            {runtime.stagedAssets.map((item) => (
              <StagedAssetPreview
                key={item.asset.id}
                item={item}
                disabled={busyRef.current || disabled || runtime.frozen}
                onRemove={runtime.removeStagedAsset}
              />
            ))}
          </div>
        ) : null}

        <form className="flex min-w-0 flex-col gap-2" onSubmit={submitMessage}>
          <Textarea
            value={runtime.composer}
            onChange={changeComposer}
            placeholder="Describe the issue, or attach screenshots for analysis."
            disabled={runtime.frozen || disabled || busyRef.current}
            maxLength={10_000}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex">
              <Input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={
                  disabled ||
                  runtime.frozen ||
                  runtime.uploadingCount > 0 ||
                  busyRef.current
                }
                onChange={attachImages}
              />
              <Button
                render={attachmentButtonRender}
                nativeButton={false}
                type="button"
                variant="outline"
                disabled={runtime.frozen || disabled || busyRef.current}
              >
                <ImagePlusIcon data-icon="inline-start" />
                {runtime.uploadingCount > 0 ? "Uploading…" : "Attach images"}
              </Button>
            </label>
            <div className="flex gap-2">
              {busyRef.current ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={stopCurrentTurn}
                >
                  <StopCircleIcon data-icon="inline-start" /> Stop
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={
                  disabled ||
                  runtime.frozen ||
                  runtime.uploadingCount > 0 ||
                  busyRef.current
                }
              >
                <SendIcon data-icon="inline-start" /> Send
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const StagedAssetPreview = ({
  item,
  disabled,
  onRemove,
}: {
  item: StagedAgentAsset
  disabled: boolean
  onRemove: (assetId: string) => Promise<void>
}) => {
  const remove = useCallback(
    () =>
      void onRemove(item.asset.id).catch(() =>
        toast.error("The staged image could not be deleted from storage.")
      ),
    [item.asset.id, onRemove]
  )
  return (
    <div className="relative overflow-hidden rounded-xl border">
      {/* Local Blob URL is ephemeral and revoked after send/remove/switch. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="size-20 object-cover"
        src={item.blobUrl}
        alt={item.asset.filename}
      />
      <Button
        className="absolute top-1 right-1"
        size="icon-xs"
        variant="secondary"
        aria-label={`Remove ${item.asset.filename}`}
        disabled={disabled}
        onClick={remove}
      >
        <XIcon />
      </Button>
    </div>
  )
}

const AgentMessage = ({
  message,
  organizationId,
}: {
  message: AgentChatMessage
  organizationId: string
}) => (
  <article
    className={`max-w-[92%] rounded-xl border p-3 ${
      message.role === "user" ? "ml-auto bg-muted" : "mr-auto bg-card"
    }`}
  >
    <p className="mb-1 text-xs font-medium text-muted-foreground">
      {message.role === "user" ? "You" : "Issue agent"}
    </p>
    {message.parts.map((part) => {
      if (part.type === "text")
        return message.role === "assistant" ? (
          <MessageResponse key={`text:${part.text}`} className="text-sm">
            {part.text}
          </MessageResponse>
        ) : (
          <p key={`text:${part.text}`} className="text-sm whitespace-pre-wrap">
            {part.text}
          </p>
        )
      if (part.type === "data-agent-assets") {
        return (
          <div
            key={`assets:${part.data.assetIds.join(":")}`}
            className="mt-2 grid grid-cols-2 gap-2"
          >
            {part.data.assetIds.map((assetId) => {
              const asset = part.data.assets?.find(
                (candidate) => candidate.id === assetId
              )
              return (
                // The authenticated API image must bypass the Next optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={assetId}
                  className="max-h-56 w-full rounded-lg object-cover"
                  src={buildAgentAssetPreviewUrl(
                    clientEnv.NEXT_PUBLIC_API_BASE_URL,
                    {
                      organizationId,
                      assetId,
                      width: FILE_PREVIEW_WIDTHS[1],
                    }
                  )}
                  width={asset?.imageWidth}
                  height={asset?.imageHeight}
                  alt={asset?.filename ?? "Attached image"}
                />
              )
            })}
          </div>
        )
      }
      return null
    })}
  </article>
)

const AgentApprovalCard = ({
  organizationId,
  actionId,
  frozen,
  onPendingChange,
}: {
  organizationId: string
  actionId: string
  frozen: boolean
  onPendingChange: (actionId: string, pending: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const actionQuery = useQuery(
    agentActionQueryOptions(apiClient, organizationId, actionId)
  )
  const resume = useCallback(async () => {
    const result = await resumeAgentAction(apiClient, actionId)
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: issueKeys.lists(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey: issueKeys.detail(organizationId, result.issue.id),
      }),
      queryClient.invalidateQueries({
        queryKey: issueKeys.timeline(organizationId, result.issue.id),
      }),
    ])
  }, [actionId, organizationId, queryClient])
  const decisionMutation = useMutation({
    mutationFn: async (decision: "yes" | "no") => {
      const action = await decideAgentAction(apiClient, {
        actionId,
        decision,
        idempotencyKey: crypto.randomUUID(),
      })
      if (decision === "yes" && action.status === "approved") await resume()
      return action
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.action(organizationId, actionId),
      })
    },
    onError: () => toast.error("The approval decision could not be completed."),
  })
  const { mutate: decide, isPending: deciding } = decisionMutation
  const resumeMutation = useMutation({
    mutationFn: resume,
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.action(organizationId, actionId),
      })
    },
    onError: () => toast.error("The approved action could not be resumed."),
  })
  const { mutate: resumeApproved, isPending: resuming } = resumeMutation
  const approve = useCallback(() => decide("yes"), [decide])
  const reject = useCallback(() => decide("no"), [decide])
  const retryResume = useCallback(() => resumeApproved(), [resumeApproved])
  const action = actionQuery.data
  const refetchAction = actionQuery.refetch
  const retryActionQuery = useCallback(
    () => void refetchAction(),
    [refetchAction]
  )
  useEffect(() => {
    if (action) onPendingChange(actionId, action.status === "pending")
  }, [action, actionId, onPendingChange])
  if (actionQuery.isPending) {
    return (
      <Card className="border-amber-500/50 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading approval details…
        </div>
      </Card>
    )
  }
  if (actionQuery.isError || !action) {
    return (
      <Card className="border-destructive/50 p-4">
        <p role="alert" className="text-sm text-destructive">
          Approval details could not be loaded.
        </p>
        <Button className="mt-3" variant="outline" onClick={retryActionQuery}>
          Try again
        </Button>
      </Card>
    )
  }
  const pending = action.status === "pending"

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Approve Issue change?</CardTitle>
          <Badge
            variant={action.preview?.destructive ? "destructive" : "outline"}
          >
            {action.kind.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Canonical API preview · expires{" "}
          <LocalDate value={action.expiresAt} includeTime />
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-medium">
          {action.preview?.title ?? "Preview unavailable"}
        </p>
        {action.preview?.fields.map((field) => (
          <div
            key={field.field}
            className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr]"
          >
            <span className="text-muted-foreground">{field.field}</span>
            <span>
              {formatActionValue(field.before)} →{" "}
              {formatActionValue(field.after)}
            </span>
          </div>
        ))}
        {action.preview && action.preview.attachments.length > 0 ? (
          <AgentApprovalAttachments
            organizationId={organizationId}
            attachments={action.preview.attachments}
          />
        ) : null}
        {pending ? (
          <div className="flex gap-2">
            <Button disabled={frozen || deciding} onClick={approve}>
              Yes
            </Button>
            <Button
              variant="outline"
              disabled={frozen || deciding}
              onClick={reject}
            >
              No
            </Button>
          </div>
        ) : action.status === "approved" ? (
          <Button disabled={frozen || resuming} onClick={retryResume}>
            Resume approved action
          </Button>
        ) : (
          <Badge variant="secondary">{action.status}</Badge>
        )}
      </CardContent>
    </Card>
  )
}

type AgentApprovalAttachment = NonNullable<
  AgentIssueAction["preview"]
>["attachments"][number]

export const AgentApprovalAttachments = ({
  organizationId,
  attachments,
}: {
  organizationId: string
  attachments: AgentApprovalAttachment[]
}) => (
  <section
    className="space-y-2 rounded-lg border bg-background/80 p-3"
    aria-label="Issue attachments awaiting approval"
  >
    <p className="text-sm font-medium">
      These images will become permanent Issue attachments if you approve this
      action.
    </p>
    <p className="text-xs text-muted-foreground">
      They will remain with the Issue after the temporary chat-image retention
      period ends.
    </p>
    <div className="grid gap-3 sm:grid-cols-2">
      {attachments.map((attachment) => (
        <figure
          key={attachment.assetId}
          className="overflow-hidden rounded-md border bg-muted/30"
        >
          {/* This authenticated private image must bypass the Next optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="max-h-64 w-full object-contain"
            src={buildAgentAssetPreviewUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL, {
              organizationId,
              assetId: attachment.assetId,
              width: FILE_PREVIEW_WIDTHS[1],
            })}
            alt={`Attachment preview: ${attachment.filename}`}
            loading="lazy"
          />
          <figcaption className="border-t px-2 py-1.5 text-xs">
            <span className="block truncate">{attachment.filename}</span>
            <span className="text-muted-foreground">
              {Math.ceil(attachment.sizeBytes / 1024)} KB
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  </section>
)

const formatActionValue = (
  value: AgentIssueAction["preview"] extends infer Preview
    ? Preview extends { fields: Array<infer Field> }
      ? Field extends { before: infer Value }
        ? Value
        : never
      : never
    : never
) => (Array.isArray(value) ? value.join(", ") : (value ?? "—"))

const policyOptions = [
  { value: "ask_each", label: "Ask each time" },
  { value: "auto_write", label: "Auto allow create/update" },
  { value: "auto_all", label: "Auto allow all Issue CRUD" },
] as const

const AgentPolicyControl = ({
  organizationId,
  threadId,
  disabled,
}: {
  organizationId: string
  threadId: string
  disabled: boolean
}) => {
  const queryClient = useQueryClient()
  const policyQuery = useQuery(
    agentApprovalPolicyQueryOptions(apiClient, organizationId, threadId)
  )
  const [destructiveConfirmation, setDestructiveConfirmation] = useState("")
  const [confirmingAutoAll, setConfirmingAutoAll] = useState(false)
  const mutation = useMutation({
    mutationFn: (mode: "ask_each" | "auto_write" | "auto_all") =>
      mode === "ask_each"
        ? deleteAgentApprovalPolicy(apiClient, threadId)
        : putAgentApprovalPolicy(apiClient, {
            threadId,
            mode,
            expiresInSeconds: 900,
            destructiveConfirmation:
              mode === "auto_all" ? "ALLOW_ISSUE_DELETE" : undefined,
          }),
    onSuccess: async () => {
      setConfirmingAutoAll(false)
      setDestructiveConfirmation("")
      await queryClient.invalidateQueries({
        queryKey: agentKeys.policy(organizationId, threadId),
      })
    },
    onError: () =>
      toast.error("The Agent approval policy could not be updated."),
  })
  const { mutate: updatePolicy, isPending: updatingPolicy } = mutation
  const selectMode = useCallback(
    (value: string | null) => {
      if (
        value !== "ask_each" &&
        value !== "auto_write" &&
        value !== "auto_all"
      )
        return
      if (value === "auto_all") {
        setConfirmingAutoAll(true)
        return
      }
      updatePolicy(value)
    },
    [updatePolicy]
  )
  const changeDestructiveConfirmation = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setDestructiveConfirmation(event.target.value),
    []
  )
  const enableAutoAll = useCallback(
    () => updatePolicy("auto_all"),
    [updatePolicy]
  )
  const cancelAutoAll = useCallback(() => setConfirmingAutoAll(false), [])

  return (
    <div className="flex flex-col items-end gap-2">
      <Select
        items={policyOptions}
        value={policyQuery.data?.mode ?? "ask_each"}
        disabled={disabled || updatingPolicy}
        onValueChange={selectMode}
      >
        <SelectTrigger className="w-56">
          {policyOptions.find(
            (option) => option.value === policyQuery.data?.mode
          )?.label ?? "Ask each time"}
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {policyOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {confirmingAutoAll ? (
        <div className="w-full max-w-sm space-y-2 rounded-xl border border-destructive/40 p-3">
          <p className="text-xs text-muted-foreground">
            This also allows Issue deletion for 15 minutes. Type
            ALLOW_ISSUE_DELETE.
          </p>
          <Input
            value={destructiveConfirmation}
            onChange={changeDestructiveConfirmation}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                destructiveConfirmation !== "ALLOW_ISSUE_DELETE" ||
                updatingPolicy ||
                disabled
              }
              onClick={enableAutoAll}
            >
              <Trash2Icon data-icon="inline-start" /> Enable
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={cancelAutoAll}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {policyQuery.data?.expiresAt ? (
        <p className="text-xs text-muted-foreground">
          Expires <LocalDate value={policyQuery.data.expiresAt} includeTime />
        </p>
      ) : null}
    </div>
  )
}
