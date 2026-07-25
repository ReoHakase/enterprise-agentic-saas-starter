"use client"

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
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { RouteLoading } from "@/components/app-state"
import {
  ConsoleFrame,
  ConsoleFrameContent,
  ConsoleFrameHeader,
} from "@/components/console-frame"
import { getConsoleLoadingPresentation } from "@/components/console-route-presentations"

type ConsoleBoundaryState = "error" | "loading"

type ConsoleBoundaryShellProps = {
  state: ConsoleBoundaryState
  children: ReactNode
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

export const ConsoleBoundaryShell = ({
  state,
  children,
}: ConsoleBoundaryShellProps) => (
  <SidebarProvider data-console-shell="true" data-boundary-state={state}>
    <ConsoleSidebarSkeleton />
    <ConsoleFrame>
      <ConsoleFrameHeader>
        <ConsoleHeaderSkeleton />
      </ConsoleFrameHeader>
      <ConsoleFrameContent>{children}</ConsoleFrameContent>
    </ConsoleFrame>
  </SidebarProvider>
)

const sidebarSkeletonRender = <div />

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
    <SidebarMenuButton size="lg" render={sidebarSkeletonRender}>
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
    <SidebarMenuButton render={sidebarSkeletonRender}>
      <Skeleton className="size-4 shrink-0 rounded-xl" />
      <Skeleton className={cn("h-4 max-w-full", textClassName)} />
    </SidebarMenuButton>
  </SidebarMenuItem>
)
