"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useId, useRef } from "react"

import {
  AppState,
  RouteLoading,
  type RouteLoadingVariant,
} from "@/components/app-state"
import { ConsoleFrame } from "@/components/console-frame"
import { useBoundaryRetry } from "@/hooks/use-boundary-retry"

type ConsoleBoundaryState = "error" | "loading"

type ConsoleBoundaryShellProps = {
  state: ConsoleBoundaryState
  children: ReactNode
}

type ConsoleLoadingPresentation = {
  label: string
  showAction: boolean
  variant: RouteLoadingVariant
}

type ConsoleErrorPresentation = {
  description: string
  showAction: boolean
  title: string
}

export const ConsoleShellSkeleton = () => {
  const pathname = usePathname()
  const presentation = getConsoleLoadingPresentation(pathname)

  return (
    <ConsoleBoundaryShell state="loading">
      <RouteLoading {...presentation} />
    </ConsoleBoundaryShell>
  )
}

export const ConsoleShellError = ({ reset }: { reset: () => void }) => (
  <ConsoleBoundaryShell state="error">
    <ConsoleContentError reset={reset} />
  </ConsoleBoundaryShell>
)

export const ConsoleContentError = ({ reset }: { reset: () => void }) => {
  const pathname = usePathname()
  const presentation = getConsoleErrorPresentation(pathname)
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const retry = useBoundaryRetry(reset)
  const retryButton = (
    <Button onClick={retry}>
      <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
      Try again
    </Button>
  )

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <section
      data-slot="page-shell"
      data-boundary-state="error"
      className="flex w-full max-w-full min-w-0 flex-col gap-6 xl:max-w-7xl"
      aria-labelledby={headingId}
      aria-live="assertive"
      role="alert"
    >
      <div
        data-slot="page-header"
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0">
          <h1
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-normal outline-none"
          >
            {presentation.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {presentation.description}
          </p>
        </div>
        {presentation.showAction ? retryButton : null}
      </div>
      <div data-slot="page-body">
        <AppState
          className="min-h-[min(32rem,60svh)] p-0"
          icon={TriangleAlertIcon}
          title="The workspace is temporarily unavailable"
          description="Try the request again. If the problem continues, wait a moment before retrying."
          actions={presentation.showAction ? undefined : retryButton}
        />
      </div>
    </section>
  )
}

export const getConsoleErrorPresentation = (
  pathname: string
): ConsoleErrorPresentation => {
  if (pathname === "/dashboard") {
    return {
      title: "Overview",
      description: "Everything your team needs is temporarily unavailable.",
      showAction: true,
    }
  }

  if (pathname.startsWith("/dashboard/todos")) {
    return {
      title: "Issues",
      description:
        "Track work for this organization. Switch organizations from the sidebar.",
      showAction: false,
    }
  }

  if (pathname === "/settings/organizations") {
    return {
      title: "Organizations",
      description:
        "Choose the tenant context for this session or create a new workspace.",
      showAction: true,
    }
  }

  if (pathname === "/settings/account") {
    return {
      title: "Account settings",
      description: "Manage your profile and active sessions from one place.",
      showAction: false,
    }
  }

  if (/^\/organization\/[^/]+\/members(?:\/|$)/.test(pathname)) {
    return {
      title: "Members",
      description: "Manage users and permissions for this organization.",
      showAction: false,
    }
  }

  if (/^\/organization\/[^/]+\/settings(?:\/|$)/.test(pathname)) {
    return {
      title: "Organization settings",
      description:
        "Manage identity and sensitive controls for this organization.",
      showAction: false,
    }
  }

  return {
    title: "Workspace",
    description:
      "This workspace view is unavailable. Your data was not changed.",
    showAction: false,
  }
}

export const getConsoleLoadingPresentation = (
  pathname: string
): ConsoleLoadingPresentation => {
  if (pathname === "/dashboard") {
    return {
      label: "Loading organization dashboard",
      showAction: true,
      variant: "dashboard",
    }
  }

  if (pathname.startsWith("/dashboard/todos")) {
    return {
      label: "Loading organization issues",
      showAction: false,
      variant: "issues",
    }
  }

  if (pathname === "/settings/organizations") {
    return {
      label: "Loading organizations",
      showAction: true,
      variant: "table",
    }
  }

  if (/^\/organization\/[^/]+\/members(?:\/|$)/.test(pathname)) {
    return {
      label: "Loading organization members",
      showAction: false,
      variant: "members",
    }
  }

  if (/^\/organization\/[^/]+\/settings(?:\/|$)/.test(pathname)) {
    return {
      label: "Loading organization settings",
      showAction: false,
      variant: "organization-settings",
    }
  }

  return {
    label: "Loading workspace settings",
    showAction: false,
    variant: "form",
  }
}

const ConsoleBoundaryShell = ({
  state,
  children,
}: ConsoleBoundaryShellProps) => (
  <SidebarProvider data-console-shell="true" data-boundary-state={state}>
    <ConsoleSidebarSkeleton />
    <ConsoleFrame header={<ConsoleHeaderSkeleton />}>{children}</ConsoleFrame>
  </SidebarProvider>
)

const ConsoleHeaderSkeleton = () => (
  <div className="contents" aria-hidden="true">
    <Skeleton className="-ml-1 size-8 rounded-xl" />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Skeleton className="h-4 w-40 max-w-full" />
      <Skeleton className="h-3 w-24 max-w-full" />
    </div>
    <Skeleton className="h-5 w-24" />
    <Skeleton className="h-5 w-16" />
    <Skeleton className="size-8 rounded-xl" />
  </div>
)

const ConsoleSidebarSkeleton = () => (
  <Sidebar collapsible="icon" variant="inset" aria-hidden="true">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarIdentitySkeleton />
        <SidebarIdentitySkeleton />
      </SidebarMenu>
    </SidebarHeader>

    <SidebarSeparator />

    <SidebarContent>
      <SidebarNavigationSkeleton label="Workspace" />
      <SidebarNavigationSkeleton label="Organization" />
      <SidebarNavigationSkeleton label="Settings" />
    </SidebarContent>

    <SidebarSeparator />
    <SidebarFooter>
      <SidebarMenu>
        <SidebarIdentitySkeleton />
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
)

const SidebarIdentitySkeleton = () => (
  <SidebarMenuItem>
    <SidebarMenuButton size="lg" render={<div />}>
      <Skeleton className="size-8 shrink-0 rounded-xl" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-32 max-w-full" />
        <Skeleton className="h-3 w-24 max-w-full" />
      </span>
    </SidebarMenuButton>
  </SidebarMenuItem>
)

const SidebarNavigationSkeleton = ({ label }: { label: string }) => (
  <SidebarGroup>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarNavigationRowSkeleton textClassName="w-3/4" />
        <SidebarNavigationRowSkeleton textClassName="w-1/2" />
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

const SidebarNavigationRowSkeleton = ({
  textClassName,
}: {
  textClassName: string
}) => (
  <SidebarMenuItem>
    <SidebarMenuButton render={<div />}>
      <Skeleton className="size-4 shrink-0 rounded-xl" />
      <Skeleton className={cn("h-4 max-w-full", textClassName)} />
    </SidebarMenuButton>
  </SidebarMenuItem>
)
