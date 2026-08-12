import { Table as UiTable } from "@enterprise-agentic-saas/ui/components/table"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { ComponentProps } from "react"

export const Table = ({ className, ...props }: ComponentProps<"table">) => (
  <UiTable
    className={cn(
      "[&_td]:border [&_td]:p-3 [&_th]:border [&_th]:bg-muted [&_th]:p-3",
      className
    )}
    containerClassName="my-6 rounded-2xl border"
    scrollLabel="Documentation table"
    data-docs-table
    {...props}
  />
)
