"use client"

import { useChat, type UseChatHelpers } from "@ai-sdk/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Card, CardContent } from "@enterprise-agentic-saas/ui/components/card"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatOnFinishCallback,
  type ChatOnToolCallCallback,
  type UIMessage,
} from "ai"
import { ImagePlusIcon, SendIcon, StopCircleIcon, XIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
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

import { createAgentChatTransport } from "@/features/agent/chat-transport"
import type { AgentContextReference } from "@/features/agent/chat-transport"
import { executeAgentClientTool } from "@/features/agent/client-tools"
import {
  AgentContextChip,
  AgentMentionCandidate,
} from "@/features/agent/components/agent-mentions"
import { AgentMessage } from "@/features/agent/components/agent-message"
import { AgentMeters } from "@/features/agent/components/agent-meters"
import { AgentPolicyControl } from "@/features/agent/components/agent-policy-control"
import { AgentSamplePrompts } from "@/features/agent/components/agent-sample-prompts"
import { useAgentFormRegistry } from "@/features/agent/form-registry"
import { isAgentHotkeyAllowed } from "@/features/agent/hotkey-scope"
import {
  agentKeys,
  agentMessagesQueryOptions,
  agentThreadContextQueryOptions,
  agentUsageQueryOptions,
} from "@/features/agent/queries"
import {
  useAgentThreadRuntimeState,
  type StagedAgentAsset,
} from "@/features/agent/runtime-state"
import {
  pendingActionToolOutputSchema,
  type AgentChatMessage,
  type AgentThread,
} from "@/features/agent/schema"
import {
  resolveAgentSubmissionIdentity,
  shouldRetainAgentSubmission,
} from "@/features/agent/submission-identity"
import { membersQueryOptions } from "@/features/console/queries"
import { issuesQueryOptions } from "@/features/issues/queries"
import { useIssueSearchState } from "@/features/issues/search-params"
import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

const attachmentButtonRender = <span />
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

export const AgentConversation = ({
  organizationId,
  organizationSlug,
  thread,
  presentation,
  disabled,
  autoSubmit,
  onAutoSubmit,
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
  presentation: "page" | "shell"
  disabled: boolean
  autoSubmit: boolean
  onAutoSubmit: () => void
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
      autoSubmit={autoSubmit}
      onAutoSubmit={onAutoSubmit}
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
  autoSubmit,
  onAutoSubmit,
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
  presentation: "page" | "shell"
  disabled: boolean
  initialMessages: AgentChatMessage[]
  autoSubmit: boolean
  onAutoSubmit: () => void
}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const formRegistry = useAgentFormRegistry()
  const { state: issueSearchState } = useIssueSearchState()
  const runtime = useAgentThreadRuntimeState(thread.id)
  const [contextReferences, setContextReferences] = useState<
    AgentContextReference[]
  >([])
  const contextReferencesRef = useRef(contextReferences)
  contextReferencesRef.current = contextReferences
  const issuesQuery = useQuery(
    issuesQueryOptions(apiClient, organizationId, issueSearchState)
  )
  const membersQuery = useQuery(membersQueryOptions(organizationId))
  const contextQuery = useQuery(
    agentThreadContextQueryOptions(apiClient, organizationId, thread.id)
  )
  const usageQuery = useQuery(agentUsageQueryOptions(apiClient, organizationId))
  const transport = useMemo(
    () =>
      createAgentChatTransport({
        apiBaseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
        threadId: thread.id,
        getContextReferences: () => contextReferencesRef.current,
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
        setContextReferences([])
      }
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: agentKeys.messages(organizationId, thread.id),
        }),
        queryClient.invalidateQueries({
          queryKey: agentKeys.threads(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: agentKeys.context(organizationId, thread.id),
        }),
        queryClient.invalidateQueries({
          queryKey: agentKeys.usage(organizationId),
        }),
      ])
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
  const mentionMatch = /(?:^|\s)@([^\s@]*)$/u.exec(runtime.composer)
  const mentionQuery = mentionMatch?.[1]?.toLocaleLowerCase() ?? ""
  const mentionCandidates = useMemo(() => {
    if (!mentionMatch) return []
    const candidates: AgentContextReference[] = [
      { kind: "current_page", path: pathname, label: "Current page" },
      ...(issuesQuery.data?.items.slice(0, 6).map((issue) => ({
        kind: "issue" as const,
        id: issue.id,
        label: `Issue #${issue.number}: ${issue.title}`,
      })) ?? []),
      ...(membersQuery.data?.slice(0, 6).map((member) => ({
        kind: "member" as const,
        id: member.userId,
        label: member.name,
      })) ?? []),
    ]
    return candidates.filter(
      (candidate) =>
        mentionQuery.length === 0 ||
        candidate.label.toLocaleLowerCase().includes(mentionQuery)
    )
  }, [
    issuesQuery.data,
    membersQuery.data,
    mentionMatch,
    mentionQuery,
    pathname,
  ])
  const addContextReference = useCallback(
    (reference: AgentContextReference) => {
      setContextReferences((current) => {
        const key =
          reference.kind === "current_page"
            ? `${reference.kind}:${reference.path}`
            : `${reference.kind}:${reference.id}`
        return current.some((item) =>
          item.kind === "current_page"
            ? `${item.kind}:${item.path}` === key
            : `${item.kind}:${item.id}` === key
        )
          ? current
          : [...current, reference]
      })
      runtime.setComposer(runtime.composer.replace(/@[^\s@]*$/u, ""))
    },
    [runtime]
  )
  const removeContextReference = useCallback(
    (reference: AgentContextReference) =>
      setContextReferences((current) =>
        current.filter((item) => item !== reference)
      ),
    []
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
      const fingerprint = JSON.stringify([
        messageText,
        assetIds,
        contextReferences,
      ])
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
    [chat, contextReferences, disabled, runtime]
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
  const composerFormRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!autoSubmit) return
    const frame = requestAnimationFrame(() => {
      composerFormRef.current?.requestSubmit()
      onAutoSubmit()
    })
    return () => cancelAnimationFrame(frame)
  }, [autoSubmit, onAutoSubmit])
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

  return (
    <Card
      className={cn(
        "flex min-h-0 min-w-0 flex-col",
        presentation === "shell" && "flex-1"
      )}
    >
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
          {chat.messages.length === 0 ? (
            <AgentSamplePrompts onSelect={runtime.setComposer} />
          ) : null}
          {chat.messages.map((message) => (
            <AgentMessage
              key={message.id}
              message={message}
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              frozen={runtime.frozen || disabled || busyRef.current}
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

        <form
          ref={composerFormRef}
          className="relative flex min-w-0 shrink-0 flex-col gap-2"
          onSubmit={submitMessage}
        >
          {contextReferences.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Agent context">
              {contextReferences.map((reference) => (
                <AgentContextChip
                  key={`${reference.kind}:${reference.label}`}
                  reference={reference}
                  onRemove={removeContextReference}
                />
              ))}
            </div>
          ) : null}
          <Textarea
            className="max-h-[40vh] min-h-24 overflow-y-auto"
            value={runtime.composer}
            onChange={changeComposer}
            placeholder="Describe the issue, or attach screenshots for analysis."
            disabled={runtime.frozen || disabled || busyRef.current}
            maxLength={10_000}
          />
          {mentionMatch ? (
            <div className="absolute right-0 bottom-full left-0 z-20 mb-2 max-h-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
              {mentionCandidates.length > 0 ? (
                mentionCandidates.map((candidate) => (
                  <AgentMentionCandidate
                    key={
                      candidate.kind === "current_page"
                        ? `${candidate.kind}:${candidate.path}`
                        : `${candidate.kind}:${candidate.id}`
                    }
                    candidate={candidate}
                    onSelect={addContextReference}
                  />
                ))
              ) : (
                <p className="p-2 text-xs text-muted-foreground">
                  No context matches.
                </p>
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <AgentPolicyControl
              organizationId={organizationId}
              threadId={thread.id}
              disabled={disabled || runtime.frozen}
            />
            <AgentMeters
              context={contextQuery.data}
              usage={usageQuery.data}
              streamedMessages={chat.messages}
            />
          </div>
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
