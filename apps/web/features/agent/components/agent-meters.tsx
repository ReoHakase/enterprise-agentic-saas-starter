"use client"

import type {
  AgentChatMessage,
  AgentMonthlyUsage,
  AgentThreadContext,
} from "../schema"

export const AgentMeters = ({
  context,
  usage,
  streamedMessages,
}: {
  context?: AgentThreadContext
  usage?: AgentMonthlyUsage
  streamedMessages: AgentChatMessage[]
}) => {
  const streamedBudget = streamedMessages
    .flatMap((message) => message.parts)
    .toReversed()
    .find((part) => part.type === "data-context-budget")
  const used =
    streamedBudget?.type === "data-context-budget"
      ? (streamedBudget.data.observedInputTokens ??
        streamedBudget.data.estimated.total)
      : (context?.estimatedHistoryTokens ?? 0)
  const windowTokens =
    streamedBudget?.type === "data-context-budget"
      ? streamedBudget.data.contextWindowTokens
      : 1_000_000
  const percent = Math.min(100, Math.round((used / windowTokens) * 100))
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span title={`${used.toLocaleString()} estimated input tokens`}>
        Context {percent}%
      </span>
      <span
        title={`${usage?.totals.totalTokenCount.toLocaleString() ?? 0} tokens this month`}
      >
        Monthly ${(usage?.totals.costMicros ?? 0) / 1_000_000} USD
      </span>
    </div>
  )
}
