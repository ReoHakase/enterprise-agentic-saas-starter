"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@enterprise-agentic-saas/ui/components/collapsible"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleEllipsisIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"
import type { ComponentProps } from "react"

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error"

const status = {
  "input-streaming": { label: "準備中", icon: CircleEllipsisIcon },
  "input-available": { label: "実行中", icon: ClockIcon },
  "approval-requested": { label: "承認待ち", icon: ClockIcon },
  "approval-responded": { label: "承認済み", icon: CheckCircleIcon },
  "output-available": { label: "完了", icon: CheckCircleIcon },
  "output-denied": { label: "拒否", icon: XCircleIcon },
  "output-error": { label: "失敗", icon: XCircleIcon },
} satisfies Record<ToolState, { label: string; icon: typeof ClockIcon }>

export const Tool = ({
  className,
  ...props
}: ComponentProps<typeof Collapsible>) => (
  <Collapsible className={cn("group w-full", className)} {...props} />
)

export const ToolHeader = ({
  className,
  state,
  title,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  state: ToolState
  title: string
}) => {
  const StatusIcon = status[state].icon
  const running = state === "input-streaming" || state === "input-available"
  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-left text-xs",
        className
      )}
      {...props}
    >
      <StatusIcon
        className={cn(
          "size-3.5 shrink-0",
          running && "animate-pulse motion-reduce:animate-none"
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      <Badge variant="secondary">{status[state].label}</Badge>
      <ChevronDownIcon
        className="size-3.5 shrink-0 transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none"
        aria-hidden
      />
    </CollapsibleTrigger>
  )
}

export const ToolContent = ({
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) => (
  <CollapsibleContent
    className={cn("space-y-2 px-3 pt-2", className)}
    {...props}
  />
)
