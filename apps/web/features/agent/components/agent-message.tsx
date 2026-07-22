"use client"

import {
  buildAgentAssetPreviewUrl,
  FILE_PREVIEW_WIDTHS,
} from "@enterprise-agentic-saas/api/client"
import { getToolName, isToolUIPart } from "ai"
import Link from "next/link"
import * as v from "valibot"

import { MessageResponse } from "@/components/ai-elements/message"
import { AgentApprovalCard } from "@/features/agent/components/agent-approval-card"
import {
  pendingActionToolOutputSchema,
  type AgentChatMessage,
} from "@/features/agent/schema"
import { clientEnv } from "@/lib/env.client"

export const issueLinksFromToolOutput = (toolName: string, output: unknown) => {
  if (
    toolName !== "get_issue" &&
    toolName !== "search_issues" &&
    toolName !== "create_issue" &&
    toolName !== "update_issue"
  )
    return []
  const rawCandidates = Array.isArray(output) ? output : [output]
  const candidates = rawCandidates.flatMap((candidate) => {
    if (
      (toolName === "create_issue" || toolName === "update_issue") &&
      candidate &&
      typeof candidate === "object"
    ) {
      const issue = Reflect.get(candidate, "issue")
      return issue && typeof issue === "object" ? [issue] : []
    }
    return [candidate]
  })
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return []
    const number = Reflect.get(candidate, "number")
    const title = Reflect.get(candidate, "title")
    return Number.isInteger(number) && Number(number) > 0
      ? [
          {
            number: Number(number),
            title: typeof title === "string" ? title : `Issue #${number}`,
          },
        ]
      : []
  })
}

export const AgentMessage = ({
  message,
  organizationId,
  organizationSlug,
  frozen,
  onPendingChange,
}: {
  message: AgentChatMessage
  organizationId: string
  organizationSlug: string
  frozen: boolean
  onPendingChange: (actionId: string, pending: boolean) => void
}) => (
  <article
    aria-label={message.role === "user" ? "Your message" : "Agent response"}
    className={`text-sm ${
      message.role === "user"
        ? "ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-3"
        : "w-full py-2"
    }`}
  >
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        const key = `${part.type}:${index}`
        if (part.type === "text")
          return message.role === "assistant" ? (
            <div key={key} role="group" aria-label="Agent answer">
              <MessageResponse className="text-sm">{part.text}</MessageResponse>
            </div>
          ) : (
            <p key={key} className="text-sm whitespace-pre-wrap">
              {part.text}
            </p>
          )
        if (part.type === "reasoning") {
          return (
            <details
              key={key}
              className="rounded-lg border bg-muted/30 px-3 py-2 text-xs"
            >
              <summary className="cursor-pointer font-medium">Thinking</summary>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                {part.text}
              </p>
            </details>
          )
        }
        if (part.type === "data-activity") {
          return null
        }
        if (part.type === "data-context-reference") {
          return (
            <span
              key={key}
              className="inline-flex max-w-full rounded-md bg-blue-500/10 px-1.5 py-0.5 text-blue-700 dark:text-blue-300"
            >
              @{part.data.label}
            </span>
          )
        }
        if (part.type === "data-thread-title") {
          return part.data.renamed ? (
            <p key={key} className="text-xs text-muted-foreground">
              Thread renamed to {part.data.title}
            </p>
          ) : null
        }
        if (part.type === "source-url") {
          return (
            <a
              key={key}
              href={part.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-blue-600 underline underline-offset-2"
            >
              {part.title ?? part.url}
            </a>
          )
        }
        if (part.type === "step-start" || part.type === "data-context-budget")
          return null
        if (isToolUIPart(part)) {
          const toolName = getToolName(part)
          if (part.state === "output-available") {
            const pendingAction = v.safeParse(
              pendingActionToolOutputSchema,
              part.output
            )
            if (pendingAction.success) {
              return (
                <AgentApprovalCard
                  key={key}
                  actionId={pendingAction.output.actionId}
                  organizationId={organizationId}
                  organizationSlug={organizationSlug}
                  frozen={frozen}
                  onPendingChange={onPendingChange}
                />
              )
            }
          }
          const issueLinks =
            part.state === "output-available"
              ? issueLinksFromToolOutput(toolName, part.output)
              : []
          return (
            <div key={key} className="space-y-2 text-xs">
              <details className="rounded-lg border bg-muted/30 px-3 py-2">
                <summary className="cursor-pointer font-medium">
                  {toolName.replaceAll("_", " ")} ·{" "}
                  {part.state.replaceAll("-", " ")}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(
                    part.state === "output-available"
                      ? part.output
                      : part.input,
                    null,
                    2
                  )}
                </pre>
              </details>
              {issueLinks.length > 0 ? (
                <div className="space-y-1">
                  {issueLinks.map((issue) => (
                    <Link
                      key={issue.number}
                      href={`/organization/${organizationSlug}/issues/${issue.number}`}
                      className="block text-blue-600 underline underline-offset-2"
                    >
                      #{issue.number} {issue.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }
        if (part.type === "data-agent-assets") {
          return (
            <div key={key} className="mt-2 grid grid-cols-2 gap-2">
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
    </div>
  </article>
)
