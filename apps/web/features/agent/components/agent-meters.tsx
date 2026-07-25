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
  const hasObservedInput = budget.observedInputTokens !== null
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
        aria-label={`${hasObservedInput ? "Last request context" : "Estimated context"} ${percent}% used`}
      />
    ),
    [hasObservedInput, percent]
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
      <TooltipContent className="max-w-[calc(100vw-2rem)] p-0 text-xs">
        <div className="w-72 max-w-[calc(100vw-2rem)] space-y-3 px-3 py-2">
          <div className="flex items-start justify-between gap-4 font-medium">
            <span>
              {hasObservedInput ? "Last request actual" : "Estimated context"}
            </span>
            <span className="shrink-0 whitespace-nowrap">
              {used.toLocaleString()} /{" "}
              {budget.contextWindowTokens.toLocaleString()}
            </span>
          </div>
          <p className="text-background/80">
            {hasObservedInput
              ? "Provider-reported input tokens from the last request."
              : "No provider result yet. Showing the preflight estimate."}
          </p>
          {hasObservedInput ? (
            <div className="flex justify-between gap-4 border-t border-background/20 pt-2">
              <span className="text-background/80">Preflight estimate</span>
              <span className="shrink-0 whitespace-nowrap">
                {budget.estimated.total.toLocaleString()}
              </span>
            </div>
          ) : null}
          <div>
            <p className="mb-1 font-medium">Estimated breakdown</p>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
              {budgetRows.map((row) => (
                <div key={row.key} className="contents">
                  <dt className="text-background/80">{row.label}</dt>
                  <dd className="whitespace-nowrap">
                    {budget.estimated[row.key].toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
