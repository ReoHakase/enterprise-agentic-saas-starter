"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { ComponentProps, HTMLAttributes } from "react"

export const Message = ({
  className,
  from,
  ...props
}: HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" }) => (
  <div
    className={cn(
      "group flex w-full flex-col gap-2",
      from === "user" && "ml-auto max-w-[85%]",
      className
    )}
    data-from={from}
    {...props}
  />
)

export const MessageContent = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex max-w-full min-w-0 flex-col gap-2 text-sm",
      "group-data-[from=user]:ml-auto group-data-[from=user]:rounded-2xl group-data-[from=user]:bg-muted group-data-[from=user]:px-4 group-data-[from=user]:py-3",
      className
    )}
    {...props}
  />
)

export const MessageActions = ({
  className,
  ...props
}: ComponentProps<"div">) => (
  <div className={cn("flex items-center gap-1", className)} {...props} />
)

export const MessageAction = ({
  label,
  tooltip,
  ...props
}: ComponentProps<typeof Button> & { label: string; tooltip?: string }) => (
  <Button
    aria-label={label}
    size="icon-xs"
    title={tooltip}
    type="button"
    variant="ghost"
    {...props}
  />
)
