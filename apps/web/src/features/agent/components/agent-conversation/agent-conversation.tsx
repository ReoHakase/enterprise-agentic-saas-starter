"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { ImagePlusIcon, SendIcon, StopCircleIcon } from "lucide-react"
import { useCallback, useEffect, useMemo } from "react"

import { apiClient } from "@/lib/api-client"

import { useAgentController } from "../../hooks/use-agent-controller"
import { agentMessagesQueryOptions } from "../../queries"
import type { AgentChatMessage, AgentThread } from "../../schema"
import {
  AgentComposer,
  type AgentComposerSnapshot,
} from "../agent-composer/agent-composer"
import {
  AgentConversationViewport,
  buildAgentConversationGroups,
} from "../agent-conversation-viewport/agent-conversation-viewport"
import { AgentMessage } from "../agent-message/agent-message"
import { AgentPolicyControl } from "../agent-policy-control/agent-policy-control"
import { AgentSamplePrompts } from "../agent-sample-prompts/agent-sample-prompts"
import { AgentStagedAsset } from "../agent-staged-asset/agent-staged-asset"
import { AgentTurnStatus } from "../agent-turn-status/agent-turn-status"

const attachmentButtonRender = <span />

export const AgentConversation = ({
  organizationId,
  organizationSlug,
  thread,
  presentation,
  disabled,
  autoSubmit,
  onAutoSubmit,
  initialComposerSnapshot,
  onInitialComposerSnapshotConsumed,
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
  presentation: "page" | "shell"
  disabled: boolean
  autoSubmit: boolean
  onAutoSubmit: () => void
  initialComposerSnapshot?: AgentComposerSnapshot
  onInitialComposerSnapshotConsumed: (threadId: string) => void
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
      <div className="grid min-h-0 flex-1 place-items-center p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading Agent history…
        </div>
      </div>
    )
  }

  if (messagesQuery.isError) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
        <div>
          <p role="alert" className="text-sm text-destructive">
            Agent history could not be loaded.
          </p>
          <Button className="mt-3" variant="outline" onClick={retryHistory}>
            Try again
          </Button>
        </div>
      </div>
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
      initialComposerSnapshot={initialComposerSnapshot}
      onInitialComposerSnapshotConsumed={onInitialComposerSnapshotConsumed}
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
  initialComposerSnapshot,
  onInitialComposerSnapshotConsumed,
}: {
  organizationId: string
  organizationSlug: string
  thread: AgentThread
  presentation: "page" | "shell"
  disabled: boolean
  initialMessages: AgentChatMessage[]
  autoSubmit: boolean
  onAutoSubmit: () => void
  initialComposerSnapshot?: AgentComposerSnapshot
  onInitialComposerSnapshotConsumed: (threadId: string) => void
}) => {
  const session = useAgentController({
    organizationId,
    organizationSlug,
    thread,
    disabled,
    initialMessages,
    autoSubmit,
    onAutoSubmit,
  })
  const { chat, runtime } = session
  const conversationGroups = useMemo(
    () => buildAgentConversationGroups(chat.messages),
    [chat.messages]
  )
  const turnPreviews = useMemo(
    () =>
      conversationGroups.flatMap((group) => (group.turn ? [group.turn] : [])),
    [conversationGroups]
  )
  useEffect(() => {
    if (!initialComposerSnapshot) return
    const frame = requestAnimationFrame(() =>
      onInitialComposerSnapshotConsumed(thread.id)
    )
    return () => cancelAnimationFrame(frame)
  }, [initialComposerSnapshot, onInitialComposerSnapshotConsumed, thread.id])

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col",
        presentation === "shell" && "flex-1"
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3",
          presentation === "shell" ? "px-3 pb-3" : "pb-4"
        )}
      >
        <AgentTurnStatus
          busy={session.busy}
          cancelState={session.cancelState}
          error={chat.error}
          transientStatus={session.transientStatus}
          turnStopped={session.turnStopped}
        />
        <AgentConversationViewport
          enabled={presentation === "shell"}
          turns={turnPreviews}
        >
          {chat.messages.length === 0 ? (
            <AgentSamplePrompts onSelect={runtime.setComposer} />
          ) : null}
          {conversationGroups.map((group) => (
            <div
              key={group.id}
              className="space-y-4"
              data-agent-turn-id={group.turn?.id}
            >
              {group.messages.map((message) => (
                <AgentMessage
                  key={message.id}
                  message={message}
                  organizationId={organizationId}
                  organizationSlug={organizationSlug}
                  frozen={runtime.frozen || disabled || session.busy}
                  onPendingChange={session.reportApprovalState}
                />
              ))}
            </div>
          ))}
        </AgentConversationViewport>

        <form
          ref={session.composerFormRef}
          className="relative flex min-w-0 shrink-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm"
          onSubmit={session.submitMessage}
        >
          <AgentComposer
            ref={session.composerRef}
            candidates={session.mentionCandidates}
            disabled={runtime.frozen || disabled}
            draftText={runtime.composer}
            initialSnapshot={initialComposerSnapshot}
            onDraftTextChange={runtime.setComposer}
          />
          {runtime.stagedAssets.some(
            (item) => !session.sendingAssetIds.includes(item.asset.id)
          ) ? (
            <div
              className="flex flex-wrap gap-2"
              aria-label="Images ready to send"
            >
              {runtime.stagedAssets
                .filter(
                  (item) => !session.sendingAssetIds.includes(item.asset.id)
                )
                .map((item) => (
                  <AgentStagedAsset
                    key={item.asset.id}
                    item={item}
                    disabled={session.busy || disabled || runtime.frozen}
                    onRemove={runtime.removeStagedAsset}
                  />
                ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <label className="inline-flex shrink-0">
              <Input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={
                  disabled ||
                  runtime.frozen ||
                  runtime.uploadingCount > 0 ||
                  session.busy
                }
                onChange={session.attachImages}
              />
              <Button
                render={attachmentButtonRender}
                nativeButton={false}
                type="button"
                variant="outline"
                size="sm"
                disabled={runtime.frozen || disabled || session.busy}
              >
                <ImagePlusIcon data-icon="inline-start" />
                {runtime.uploadingCount > 0 ? "Uploading…" : "Attach"}
              </Button>
            </label>
            <AgentPolicyControl
              organizationId={organizationId}
              threadId={thread.id}
              disabled={disabled || runtime.frozen}
            />
            <div className="ml-auto flex shrink-0 gap-2">
              {session.busy ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={session.stopCurrentTurn}
                  disabled={session.cancelState === "canceling"}
                >
                  <StopCircleIcon data-icon="inline-start" />{" "}
                  {session.cancelState === "canceling"
                    ? "Stopping…"
                    : session.cancelState === "failed"
                      ? "Retry stop"
                      : "Stop"}
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={
                  disabled ||
                  runtime.frozen ||
                  runtime.uploadingCount > 0 ||
                  session.busy
                }
              >
                <SendIcon data-icon="inline-start" /> Send
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
