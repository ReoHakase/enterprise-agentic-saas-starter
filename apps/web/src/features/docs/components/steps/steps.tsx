import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { ComponentProps } from "react"

export const Steps = ({ className, ...props }: ComponentProps<"ol">) => (
  <ol
    className={cn(
      "my-8! ml-3 list-none! border-l pl-8! [counter-reset:docs-step]",
      className
    )}
    data-docs-steps
    {...props}
  />
)

export const Step = ({ className, ...props }: ComponentProps<"li">) => (
  <li
    className={cn(
      "relative my-0! pb-8 [counter-increment:docs-step] before:absolute before:top-0 before:left-[-2.8rem] before:flex before:size-6 before:items-center before:justify-center before:rounded-full before:border before:bg-background before:text-xs before:font-semibold before:text-muted-foreground before:content-[counter(docs-step)] last:pb-0 [&>:first-child]:mt-0 [&>:last-child]:mb-0",
      className
    )}
    data-docs-step
    {...props}
  />
)
