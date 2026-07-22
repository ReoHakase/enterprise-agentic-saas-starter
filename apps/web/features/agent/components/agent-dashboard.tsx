"use client"

import { useAgentChat, getToolOutput } from "@cloudflare/ai-chat/react"
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAgent } from "agents/react"
import { isToolUIPart, type UIMessage } from "ai"
import {
  ArchiveIcon,
  ImagePlusIcon,
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

import { LocalDate } from "@/components/local-date"
import {
  archiveAgentThread,
  createAgentConnectionTicket,
  createAgentResumeTicket,
  createAgentThread,
  deleteAgentApprovalPolicy,
  decideAgentAction,
  putAgentApprovalPolicy,
} from "@/features/agent/api"
import { executeAgentClientTool } from "@/features/agent/client-tools"
import { useAgentFormRegistry } from "@/features/agent/form-registry"
import {
  agentActionQueryOptions,
  agentApprovalPolicyQueryOptions,
  agentKeys,
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
  type AgentIssueAction,
  type AgentThread,
} from "@/features/agent/schema"
import { useIssueSearchState } from "@/features/issues/search-params"
import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

type AgentAssetMessage = {
  id: string
  filename: string
  sizeBytes: number
  imageWidth: number
  imageHeight: number
  expiresAt: string
}
type AgentChatMessage = UIMessage<
  unknown,
  { "agent-assets": { assets: AgentAssetMessage[] } }
>
const attachmentButtonRender = <span />

export const extractPendingActionIds = (messages: UIMessage[]) => {
  const ids = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue
      const parsed = v.safeParse(
        pendingActionToolOutputSchema,
        getToolOutput(part)
      )
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
}: {
  organizationId: string
  organizationSlug: string
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
    if (!threadsQuery.data || selectedThread || state.agentThread === "") return
    const missingThreadId = state.agentThread
    runtime.beginThreadSwitch(missingThreadId)
    void runtime
      .completeThreadSwitch(missingThreadId, { discardDraft: true })
      .then(() => setDiscrete({ agentThread: null }, { history: "replace" }))
      .finally(() => runtime.cancelThreadSwitch())
  }, [
    runtime,
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
      <div className="grid min-h-136 min-w-0 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Private threads</CardTitle>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="New agent thread"
              disabled={creatingThread || runtime.frozen}
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
                disabled={archivingThread || runtime.frozen}
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

        {selectedThread ? (
          <ConnectedAgentChat
            key={selectedThread.id}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            thread={selectedThread}
          />
        ) : (
          <Card className="grid place-items-center p-8 text-center">
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
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
}) => {
  const router = useRouter()
  const formRegistry = useAgentFormRegistry()
  const { state: issueSearchState } = useIssueSearchState()
  const runtime = useAgentThreadRuntimeState(thread.id)
  const createConnectionQuery = useCallback(
    async () => ({
      ticket: (await createAgentConnectionTicket(apiClient, thread.id)).ticket,
    }),
    [thread.id]
  )
  const agent = useAgent({
    agent: "IssueAssistant",
    name: thread.id,
    host: clientEnv.NEXT_PUBLIC_AGENT_BASE_URL,
    // useAgentのasync queryは初回Suspense retryを跨ぐ短いmemory cacheが必須。
    // close/reconnect時はSDKが明示invalidateし、ticketを再取得する。
    cacheTtl: 5_000,
    queryDeps: [organizationId, thread.id],
    query: createConnectionQuery,
  })
  const handleToolCall = useCallback(
    async ({
      toolCall,
      addToolOutput,
    }: Parameters<
      NonNullable<Parameters<typeof useAgentChat>[0]["onToolCall"]>
    >[0]) => {
      try {
        const output = await executeAgentClientTool(
          toolCall.toolName,
          toolCall.input,
          {
            organizationId,
            organizationSlug,
            frozen: runtime.frozen,
            navigate: router.push,
            issueSearchState,
            readForm: formRegistry.read,
            patchForm: formRegistry.patch,
          }
        )
        addToolOutput({ toolCallId: toolCall.toolCallId, output })
      } catch (error) {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText:
            error instanceof Error ? error.message : "Client tool failed.",
        })
      }
    },
    [
      formRegistry,
      organizationId,
      organizationSlug,
      router.push,
      runtime.frozen,
      issueSearchState,
    ]
  )
  const chat = useAgentChat<unknown, AgentChatMessage>({
    agent,
    onToolCall: handleToolCall,
    resume: true,
  })
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
  busyRef.current =
    chat.isStreaming || chat.isRecovering || chat.status === "submitted"
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
        close: () => agent.close(),
        stop: () => void stopChat(),
        isBusy: () => busyRef.current,
        hasPendingApprovals: () => approvalsRef.current,
      }),
    [agent, registerSession, stopChat]
  )
  const resumeAction = useCallback(
    async (id: string) => {
      const resumeTicket = await createAgentResumeTicket(apiClient, id)
      await agent.call("resumeIssueAction", [
        { actionId: id, resumeTicket: resumeTicket.ticket },
      ])
    },
    [agent]
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
      if (runtime.frozen || busyRef.current || runtime.uploadingCount > 0)
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
      try {
        await chat.sendMessage(
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: text || "Please review the attached images.",
              },
              ...(assets.length > 0
                ? [{ type: "data-agent-assets" as const, data: { assets } }]
                : []),
            ],
          },
          {
            body: {
              assetIds: assets.map((asset) => asset.id),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          }
        )
        runtime.setComposer("")
        runtime.clearStagedAssetsAfterSend()
      } catch {
        toast.error("The message could not be sent. Your local draft was kept.")
      }
    },
    [chat, runtime]
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
    <Card className="flex min-h-0 min-w-0 flex-col">
      <CardHeader className="gap-3 border-b">
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
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
        {agent.connectionError ? (
          <p role="alert" className="text-sm text-destructive">
            Agent connection failed. Refresh the thread to request a new
            one-time ticket.
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
              frozen={runtime.frozen}
              resume={resumeAction}
              onPendingChange={reportApprovalState}
            />
          ))}
          {chat.isRecovering ? (
            <p className="text-sm text-muted-foreground">
              Recovering the active turn…
            </p>
          ) : null}
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
            disabled={runtime.frozen}
            maxLength={10_000}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex">
              <Input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={runtime.frozen || runtime.uploadingCount > 0}
                onChange={attachImages}
              />
              <Button
                render={attachmentButtonRender}
                type="button"
                variant="outline"
                disabled={runtime.frozen}
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
  onRemove,
}: {
  item: StagedAgentAsset
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
        return (
          <p key={`text:${part.text}`} className="text-sm whitespace-pre-wrap">
            {part.text}
          </p>
        )
      if (part.type === "data-agent-assets") {
        return (
          <div
            key={`assets:${part.data.assets.map((asset) => asset.id).join(":")}`}
            className="mt-2 grid grid-cols-2 gap-2"
          >
            {part.data.assets.map((asset) => (
              // The authenticated API image must bypass the Next optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={asset.id}
                className="max-h-56 w-full rounded-lg object-cover"
                src={buildAgentAssetPreviewUrl(
                  clientEnv.NEXT_PUBLIC_API_BASE_URL,
                  {
                    organizationId,
                    assetId: asset.id,
                    width: FILE_PREVIEW_WIDTHS[1],
                  }
                )}
                width={asset.imageWidth}
                height={asset.imageHeight}
                alt={asset.filename}
              />
            ))}
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
  resume,
  onPendingChange,
}: {
  organizationId: string
  actionId: string
  frozen: boolean
  resume: (actionId: string) => Promise<void>
  onPendingChange: (actionId: string, pending: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const actionQuery = useQuery(
    agentActionQueryOptions(apiClient, organizationId, actionId)
  )
  const decisionMutation = useMutation({
    mutationFn: async (decision: "yes" | "no") => {
      const action = await decideAgentAction(apiClient, {
        actionId,
        decision,
        idempotencyKey: crypto.randomUUID(),
      })
      if (decision === "yes" && action.status === "approved")
        await resume(actionId)
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
    mutationFn: () => resume(actionId),
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
  useEffect(() => {
    if (action) onPendingChange(actionId, action.status === "pending")
  }, [action, actionId, onPendingChange])
  if (!action) return null
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
        {action.preview?.attachments.map((attachment) => (
          <p key={attachment.assetId} className="text-sm">
            Attachment: {attachment.filename} (
            {Math.ceil(attachment.sizeBytes / 1024)} KB)
          </p>
        ))}
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
}: {
  organizationId: string
  threadId: string
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
                updatingPolicy
              }
              onClick={enableAutoAll}
            >
              <Trash2Icon data-icon="inline-start" /> Enable
            </Button>
            <Button size="sm" variant="outline" onClick={cancelAutoAll}>
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
