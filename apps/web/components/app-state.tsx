import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export const AppState = ({
  icon: Icon,
  title,
  description,
  actions,
  className = "min-h-svh",
}: {
  icon: LucideIcon
  title: string
  description: string
  actions?: ReactNode
  className?: string
}) => (
  <main className={cn("flex items-center justify-center p-6", className)}>
    <Empty className="w-full max-w-lg border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {actions ? <EmptyContent>{actions}</EmptyContent> : null}
    </Empty>
  </main>
)

export const RouteLoading = ({
  className = "min-h-svh",
  label = "Loading workspace",
}: {
  className?: string
  label?: string
}) => (
  <main
    className={cn(
      "mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-8",
      className
    )}
    aria-busy="true"
    aria-label={label}
  >
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-9 w-28" />
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <Skeleton className="h-28 rounded-4xl" />
      <Skeleton className="h-28 rounded-4xl" />
      <Skeleton className="h-28 rounded-4xl" />
    </div>
    <Skeleton className="min-h-96 flex-1 rounded-4xl" />
  </main>
)
