"use client"

import {
  buildAgentAssetPreviewUrl,
  FILE_PREVIEW_WIDTHS,
} from "@enterprise-agentic-saas/api/client"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@enterprise-agentic-saas/ui/components/ai-elements/message"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@enterprise-agentic-saas/ui/components/ai-elements/reasoning"
import { isToolUIPart } from "ai"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { clientEnv } from "@/lib/env.client"
import { reportObservedError } from "@/lib/report-observed-error"

import type { AgentChatMessage } from "../../schema"
import { MessageResponse } from "../message-response/message-response"
import { AgentToolPart } from "./agent-tool-part"

const reasoningSummary = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^(?:#{1,6}\s+|[-*>]\s*)/u, "")
    .replace(/[*_~`]/gu, "")
    ?.slice(0, 160)

const useCopyAnswer = (answer: string) => {
  const [copied, setCopied] = useState(false)
  const copyAnswer = useCallback(async () => {
    if (!answer) return
    try {
      await navigator.clipboard.writeText(answer)
      setCopied(true)
    } catch (error) {
      reportObservedError(error, { operation: "agent.message.copy" })
      setCopied(false)
      toast.error("The response could not be copied.")
    }
  }, [answer])
  return { copied, copyAnswer }
}

const AgentAssetPart = ({
  assetIds,
  assets,
  organizationId,
}: {
  assetIds: string[]
  assets?: Array<{
    filename?: string
    id: string
    imageHeight?: number
    imageWidth?: number
  }>
  organizationId: string
}) => (
  <div className="mt-2 grid grid-cols-2 gap-2">
    {assetIds.map((assetId) => {
      const asset = assets?.find((candidate) => candidate.id === assetId)
      return (
        // The authenticated API image must bypass the Next optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={assetId}
          className="max-h-56 w-full rounded-lg object-cover"
          src={buildAgentAssetPreviewUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL, {
            organizationId,
            assetId,
            width: FILE_PREVIEW_WIDTHS[1],
          })}
          width={asset?.imageWidth}
          height={asset?.imageHeight}
          alt={asset?.filename ?? "Attached image"}
        />
      )
    })}
  </div>
)

export const AgentMessage = ({
  message,
  organizationId,
  organizationSlug,
  frozen,
  isStreaming = false,
  onPendingChange,
}: {
  message: AgentChatMessage
  organizationId: string
  organizationSlug: string
  frozen: boolean
  isStreaming?: boolean
  onPendingChange: (actionId: string, pending: boolean) => void
}) => {
  const answer = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim()
  const { copied, copyAnswer } = useCopyAnswer(answer)
  const canonicalSourceUrls = new Set(
    message.parts.flatMap((part) =>
      part.type === "source-url" ? [part.url] : []
    )
  )
  return (
    <Message
      from={message.role === "user" ? "user" : "assistant"}
      role="article"
      aria-label={message.role === "user" ? "Your message" : "Agent response"}
      className="text-sm"
    >
      <MessageContent className="space-y-2">
        {message.parts.map((part, index) => {
          const key = `${part.type}:${index}`
          if (part.type === "reasoning") {
            const reasoningIsStreaming =
              part.state === "streaming" ||
              (isStreaming &&
                part.state === undefined &&
                index === message.parts.length - 1)
            return (
              <Reasoning
                key={key}
                className="my-3"
                isStreaming={reasoningIsStreaming}
                summary={reasoningSummary(part.text)}
              >
                <ReasoningTrigger />
                <ReasoningContent>
                  <MessageResponse className="text-sm">
                    {part.text}
                  </MessageResponse>
                </ReasoningContent>
              </Reasoning>
            )
          }
          if (part.type === "text")
            return message.role === "assistant" ? (
              <div key={key} role="group" aria-label="Agent answer">
                <MessageResponse className="text-sm">
                  {part.text}
                </MessageResponse>
              </div>
            ) : (
              <p key={key} className="text-sm whitespace-pre-wrap">
                {part.text}
              </p>
            )
          if (part.type === "data-context-reference")
            return (
              <span
                key={key}
                className="inline-flex max-w-full rounded-md bg-blue-500/10 px-1.5 py-0.5 text-blue-700 dark:text-blue-300"
              >
                @{part.data.label}
              </span>
            )
          if (part.type === "source-url")
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
          if (part.type === "step-start") return null
          if (isToolUIPart(part))
            return (
              <AgentToolPart
                key={key}
                canonicalSourceUrls={canonicalSourceUrls}
                frozen={frozen}
                organizationId={organizationId}
                organizationSlug={organizationSlug}
                part={part}
                onPendingChange={onPendingChange}
              />
            )
          if (part.type === "data-agent-assets")
            return (
              <AgentAssetPart
                key={key}
                assetIds={part.data.assetIds}
                assets={part.data.assets}
                organizationId={organizationId}
              />
            )
          return null
        })}
      </MessageContent>
      {message.role === "assistant" && answer ? (
        <MessageActions>
          <MessageAction
            label={copied ? "Response copied" : "Copy response"}
            tooltip={copied ? "Copied" : "Copy"}
            onClick={copyAnswer}
          >
            {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          </MessageAction>
        </MessageActions>
      ) : null}
    </Message>
  )
}
