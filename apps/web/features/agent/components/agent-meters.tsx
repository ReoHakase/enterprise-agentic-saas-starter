"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@enterprise-agentic-saas/ui/components/tooltip"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useMemo } from "react"

import type { AgentChatMessage, AgentThreadContext } from "../schema"

const budgetRows = [
  { key: "system", label: "System" },
  { key: "skills", label: "Skills" },
  { key: "tools", label: "Tools" },
  { key: "history", label: "History" },
  { key: "pageContext", label: "Page context" },
  { key: "attachments", label: "Attachments" },
] as const
export const AgentMeters = ({
  context,
  streamedMessages,
}: {
  context?: AgentThreadContext
  streamedMessages: AgentChatMessage[]
}) => {
  const streamedBudget = streamedMessages
    .flatMap((message) => message.parts)
    .toReversed()
    .find((part) => part.type === "data-context-budget")
  const budget =
    streamedBudget?.type === "data-context-budget"
      ? streamedBudget.data
      : {
          contextWindowTokens: 1_000_000,
          observedInputTokens: null,
          estimated: {
            system: 0,
            skills: 0,
            tools: 0,
            history: context?.estimatedHistoryTokens ?? 0,
            pageContext: 0,
            attachments: 0,
            total: context?.estimatedHistoryTokens ?? 0,
          },
        }
  const used = budget.observedInputTokens ?? budget.estimated.total
  const percent = Math.min(
    100,
    Math.round((used / budget.contextWindowTokens) * 100)
  )
  const tone =
    percent >= 95
      ? "text-destructive"
      : percent >= 85
        ? "text-orange-500"
        : percent >= 70
          ? "text-amber-500"
          : "text-blue-500"
  const contextMeterTrigger = useMemo(
    () => (
      <button
        type="button"
        className="relative grid size-9 shrink-0 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Context window ${percent}% used`}
      />
    ),
    [percent]
  )

  return (
    <Tooltip>
      <TooltipTrigger render={contextMeterTrigger}>
        <svg className="size-9 -rotate-90" viewBox="0 0 36 36" aria-hidden>
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            pathLength="100"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${percent} 100`}
            className={cn("transition-colors", tone)}
          />
        </svg>
        <span className="absolute text-[9px] font-medium">{percent}%</span>
      </TooltipTrigger>
      <TooltipContent className="w-64 space-y-2 text-xs">
        <div className="flex justify-between gap-4 font-medium">
          <span>Context window</span>
          <span>
            {used.toLocaleString()} /{" "}
            {budget.contextWindowTokens.toLocaleString()}
          </span>
        </div>
        <p className="text-muted-foreground">
          {budget.observedInputTokens === null
            ? "Estimated input tokens"
            : `${budget.observedInputTokens.toLocaleString()} observed · ${budget.estimated.total.toLocaleString()} estimated`}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          {budgetRows.map((row) => (
            <div key={row.key} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd>{budget.estimated[row.key].toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  )
}
