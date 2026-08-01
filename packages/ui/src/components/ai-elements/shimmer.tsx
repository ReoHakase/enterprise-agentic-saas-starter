import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { ComponentProps } from "react"

export const Shimmer = ({ className, ...props }: ComponentProps<"span">) => (
  <span
    className={cn(
      "inline-block animate-[agent-shimmer_1.6s_linear_infinite] bg-[linear-gradient(90deg,var(--muted-foreground)_25%,var(--foreground)_50%,var(--muted-foreground)_75%)] bg-size-[200%_100%] bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:text-muted-foreground",
      className
    )}
    {...props}
  />
)
