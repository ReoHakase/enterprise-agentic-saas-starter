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
import { type ReactNode, useId } from "react"

import {
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
} from "@/components/page-shell"

export const AppState = ({
  icon: Icon,
  title,
  description,
  children,
  className = "min-h-svh",
}: {
  icon: LucideIcon
  title: string
  description: string
  children?: ReactNode
  className?: string
}) => {
  const titleId = useId()

  return (
    <section
      className={cn("flex items-center justify-center p-6", className)}
      aria-labelledby={titleId}
    >
      <Empty className="w-full max-w-lg border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle id={titleId}>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {children ? <EmptyContent>{children}</EmptyContent> : null}
      </Empty>
    </section>
  )
}

export type RouteLoadingVariant =
  | "dashboard"
  | "form"
  | "issues"
  | "members"
  | "organization-settings"
  | "table"

export const RouteLoading = ({
  className,
  label = "Loading workspace",
  showAction = false,
  variant = "form",
}: {
  className?: string
  label?: string
  showAction?: boolean
  variant?: RouteLoadingVariant
}) => (
  <section
    className={cn(
      "flex w-full max-w-full min-w-0 flex-col gap-6 xl:max-w-7xl",
      className
    )}
    aria-busy="true"
    aria-label={label}
    aria-live="polite"
    role="status"
    data-slot="page-shell"
    data-route-boundary="true"
    data-boundary-state="loading"
  >
    <div className="contents" aria-hidden="true">
      <RouteHeadingSkeleton showAction={showAction} />
      <div data-slot="page-body">
        <RouteBodySkeleton variant={variant} />
      </div>
    </div>
  </section>
)

const RouteHeadingSkeleton = ({ showAction }: { showAction: boolean }) => (
  <PageHeader>
    <PageHeaderCopy>
      <Skeleton className="h-8 w-44 max-w-full" />
      <PageHeaderDescription>
        <Skeleton className="h-10 w-96 max-w-full sm:h-5" />
      </PageHeaderDescription>
    </PageHeaderCopy>
    {showAction ? <Skeleton className="h-9 w-36" /> : null}
  </PageHeader>
)

const RouteBodySkeleton = ({ variant }: { variant: RouteLoadingVariant }) => {
  if (variant === "dashboard") {
    return <DashboardBodySkeleton />
  }

  if (variant === "issues") {
    return <IssuesBodySkeleton />
  }

  if (variant === "members") {
    return <MembersBodySkeleton />
  }

  if (variant === "organization-settings") {
    return <OrganizationSettingsBodySkeleton />
  }

  if (variant === "table") {
    return <TableBodySkeleton />
  }

  return <FormBodySkeleton />
}

const DashboardBodySkeleton = () => (
  <div className="flex flex-col gap-5">
    <Skeleton className="h-48 w-full rounded-2xl" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
    </div>
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  </div>
)

const IssuesBodySkeleton = () => (
  <div className="flex min-w-0 flex-col gap-5">
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <Skeleton className="h-16 rounded-2xl sm:h-28" />
      <Skeleton className="h-16 rounded-2xl sm:h-28" />
      <Skeleton className="h-16 rounded-2xl sm:h-28" />
    </div>
    <div className="flex flex-col gap-4 rounded-2xl border p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <Skeleton className="h-9 w-full md:max-w-md" />
        <Skeleton className="h-9 w-full md:w-44" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-44" />
      </div>
    </div>
  </div>
)

const TableBodySkeleton = () => (
  <div className="overflow-hidden rounded-2xl border">
    <Skeleton className="h-12 w-full rounded-none" />
    <div className="flex flex-col gap-px bg-border">
      <Skeleton className="h-16 w-full rounded-none" />
      <Skeleton className="h-16 w-full rounded-none" />
      <Skeleton className="h-16 w-full rounded-none" />
      <Skeleton className="h-16 w-full rounded-none" />
    </div>
  </div>
)

const MembersBodySkeleton = () => (
  <div className="flex min-w-0 flex-col gap-8">
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <TableBodySkeleton />
    </section>
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <TableBodySkeleton />
    </section>
  </div>
)

const OrganizationSettingsBodySkeleton = () => (
  <div className="flex min-w-0 flex-col gap-8">
    <Skeleton className="h-24 rounded-2xl" />
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <Skeleton className="h-44 w-full max-w-2xl rounded-2xl" />
      <div className="flex items-center justify-between gap-3 border-t py-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
    <Skeleton className="h-48 rounded-2xl" />
  </div>
)

const FormBodySkeleton = () => (
  <div className="grid min-w-0 gap-6">
    <Skeleton className="h-48 rounded-2xl" />
    <Skeleton className="h-64 rounded-2xl" />
    <Skeleton className="h-56 rounded-2xl" />
  </div>
)
