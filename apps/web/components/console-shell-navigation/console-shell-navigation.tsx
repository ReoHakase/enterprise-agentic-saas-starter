"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import {
  BotIcon,
  Building2Icon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SettingsIcon,
  UserCircleIcon,
  UsersRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react"

import { SidebarMenuLinkButton } from "@/components/navigation-link/navigation-link"
import { withAgentThreadHref } from "@/features/issues"
import type { OrganizationSummary } from "@/features/organizations"

type NavigationItem = {
  href: string
  label: string
  icon: LucideIcon
}

const accountNavigation: NavigationItem[] = [
  {
    href: "/settings/organizations",
    label: "Organizations",
    icon: Building2Icon,
  },
  { href: "/settings/account", label: "Account", icon: UserCircleIcon },
]

const ConsoleRouteEffects = ({
  contentRef,
  pathname,
}: {
  contentRef: RefObject<HTMLDivElement | null>
  pathname: string
}) => {
  const { setOpenMobile } = useSidebar()
  const previousPathnameRef = useRef(pathname)

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      setOpenMobile(false)
    }
    previousPathnameRef.current = pathname
    contentRef.current?.scrollTo({ top: 0 })

    const frame = requestAnimationFrame(() => {
      const heading =
        contentRef.current?.querySelector<HTMLHeadingElement>("h1")
      if (heading) {
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [contentRef, pathname, setOpenMobile])

  return null
}

const MobileSidebarClose = () => {
  const { isMobile, setOpenMobile } = useSidebar()
  const closeNavigation = useCallback(
    () => setOpenMobile(false),
    [setOpenMobile]
  )

  if (!isMobile) {
    return null
  }

  return (
    <Button
      className="self-end"
      variant="ghost"
      size="icon-sm"
      aria-label="Close navigation"
      onClick={closeNavigation}
    >
      <XIcon aria-hidden="true" />
    </Button>
  )
}

const NavigationFallback = () => (
  <SidebarGroup>
    <SidebarGroupLabel>Workspace</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex h-8 items-center gap-2 rounded-xl px-2">
            <Skeleton className="size-4 shrink-0 rounded-xl" />
            <Skeleton className="h-4 w-3/4 max-w-full" />
          </div>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <div className="flex h-8 items-center gap-2 rounded-xl px-2">
            <Skeleton className="size-4 shrink-0 rounded-xl" />
            <Skeleton className="h-4 w-1/2 max-w-full" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

const navigationFallback = <NavigationFallback />

const ConsoleNavigation = ({
  activeOrganization,
  agentThread,
}: {
  activeOrganization?: OrganizationSummary
  agentThread: string
}) => {
  const pathname = usePathname()
  const workspaceNavigation = useMemo<NavigationItem[]>(
    () =>
      activeOrganization
        ? [
            {
              href: `/organization/${activeOrganization.slug}/dashboard`,
              label: "Overview",
              icon: LayoutDashboardIcon,
            },
            {
              href: `/organization/${activeOrganization.slug}/issues`,
              label: "Issues",
              icon: ListChecksIcon,
            },
            {
              href: `/organization/${activeOrganization.slug}/agent`,
              label: "Agent",
              icon: BotIcon,
            },
          ]
        : [],
    [activeOrganization]
  )
  const organizationNavigation = useMemo<NavigationItem[]>(
    () =>
      activeOrganization
        ? [
            {
              href: `/organization/${activeOrganization.slug}/members`,
              label: "Members",
              icon: UsersRoundIcon,
            },
            ...(activeOrganization.permissions.canEditOrganization
              ? [
                  {
                    href: `/organization/${activeOrganization.slug}/settings`,
                    label: "Organization settings",
                    icon: SettingsIcon,
                  } satisfies NavigationItem,
                ]
              : []),
          ]
        : [],
    [activeOrganization]
  )

  return (
    <>
      <NavigationGroup
        label="Workspace"
        items={workspaceNavigation}
        pathname={pathname}
        agentThread={agentThread}
      />
      {organizationNavigation.length > 0 ? (
        <NavigationGroup
          label="Organization"
          items={organizationNavigation}
          pathname={pathname}
          agentThread={agentThread}
        />
      ) : null}
      <NavigationGroup
        label="Settings"
        items={accountNavigation}
        pathname={pathname}
        agentThread={agentThread}
      />
    </>
  )
}

const NavigationGroup = ({
  label,
  items,
  pathname,
  agentThread,
}: {
  label: string
  items: NavigationItem[]
  pathname: string
  agentThread: string
}) => (
  <SidebarGroup>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {items.map((item) => (
          <NavigationMenuItem
            key={item.href}
            item={item}
            agentThread={agentThread}
            active={
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(`${item.href}/`))
            }
          />
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

const NavigationMenuItem = ({
  item,
  agentThread,
  active,
}: {
  item: NavigationItem
  agentThread: string
  active: boolean
}) => {
  const Icon = item.icon
  const { setOpenMobile } = useSidebar()
  const handleNavigate = useCallback(() => {
    setOpenMobile(false)
  }, [setOpenMobile])

  return (
    <SidebarMenuItem>
      <SidebarMenuLinkButton
        isActive={active}
        tooltip={item.label}
        href={withAgentThreadHref(item.href, agentThread)}
        onClick={handleNavigate}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuLinkButton>
    </SidebarMenuItem>
  )
}

export {
  ConsoleNavigation as consoleNavigation,
  ConsoleRouteEffects as consoleRouteEffects,
  MobileSidebarClose as mobileSidebarClose,
  navigationFallback,
}
