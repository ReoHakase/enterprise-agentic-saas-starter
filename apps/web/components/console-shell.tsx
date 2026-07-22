"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
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
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  BlocksIcon,
  BotIcon,
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleUserRoundIcon,
  EllipsisVerticalIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  UserCircleIcon,
  UsersRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { usePathname, useRouter } from "next/navigation"
import {
  Suspense,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import {
  ConsoleFrame,
  ConsoleFrameContent,
  ConsoleFrameHeader,
} from "@/components/console-frame"
import {
  DropdownMenuLinkItem,
  SidebarMenuLinkButton,
} from "@/components/navigation-link"
import { OrganizationProfileImage } from "@/components/organization-identity"
import { UserProfileImage } from "@/components/user-identity"
import { AccountSwitcherDialog } from "@/features/account/components/account-switcher-dialog"
import { AgentFormRegistryProvider } from "@/features/agent/form-registry"
import {
  AgentRuntimeProvider,
  hasOrganizationSwitchRisks,
  useAgentRuntimeState,
  type OrganizationSwitchRisks,
} from "@/features/agent/runtime-state"
import { showConsoleApiErrorToast } from "@/features/console/error-toast"
import {
  cancelTenantWorkForOrganizationSwitch,
  prepareOrganizationSwitch,
} from "@/features/organizations/cache"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { roleLabel, type Me, type OrganizationSummary } from "@/lib/console-api"

type ConsoleShellProps = {
  me: Me
  children: ReactNode
}

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

const organizationSwitcherTrigger = (
  <SidebarMenuButton size="lg" tooltip="Switch organization" />
)
const themeSelectorTrigger = <Button variant="ghost" size="icon-sm" />
const userMenuTrigger = <SidebarMenuButton size="lg" tooltip="Account menu" />
const emptyOrganizationIdentity = { name: "Organization" }

export const ConsoleShell = ({ me, children }: ConsoleShellProps) => {
  const activeOrganization = me.organizations.find(
    (organization) => organization.active
  )

  return (
    <AgentFormRegistryProvider>
      <AgentRuntimeProvider
        userId={me.user.id}
        organizationId={activeOrganization?.id ?? ""}
      >
        <ConsoleShellContent me={me}>{children}</ConsoleShellContent>
      </AgentRuntimeProvider>
    </AgentFormRegistryProvider>
  )
}

const ConsoleShellContent = ({ me, children }: ConsoleShellProps) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const agentRuntime = useAgentRuntimeState()
  const pathname = usePathname()
  const contentRef = useRef<HTMLDivElement>(null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [pendingOrganizationSwitch, setPendingOrganizationSwitch] = useState<{
    organizationId: string
    risks: OrganizationSwitchRisks
  }>()
  const openAccountSwitcher = useCallback(() => setAccountDialogOpen(true), [])
  const activeOrganization = me.organizations.find(
    (organization) => organization.active
  )
  const routeOrganizationSlug = pathname.match(
    /^\/organization\/([^/]+)(?:\/|$)/
  )?.[1]
  const contextOrganization = routeOrganizationSlug
    ? me.organizations.find(
        (organization) => organization.slug === routeOrganizationSlug
      )
    : activeOrganization
  const hasOrganizationContextMismatch = Boolean(
    contextOrganization &&
    activeOrganization &&
    contextOrganization.id !== activeOrganization.id
  )

  const organizationMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      await cancelTenantWorkForOrganizationSwitch(queryClient)
      return browserConsoleApi.activateOrganization(organizationId)
    },
    onSuccess: async (_, organizationId) => {
      await agentRuntime.completeOrganizationSwitch()
      await prepareOrganizationSwitch(queryClient, organizationId)
      const organizationRoute = pathname.match(
        /^\/organization\/[^/]+\/(dashboard|issues|agent|members|settings)(?:\/|$)/
      )
      const nextOrganization = me.organizations.find(
        (organization) => organization.id === organizationId
      )
      let nextPathname = pathname
      if (organizationRoute?.[1] && nextOrganization) {
        nextPathname = `/organization/${nextOrganization.slug}/${organizationRoute[1]}`
      }
      // usePathname excludes the search string, so this also clears every
      // tenant query parameter, including agentThread, before refresh.
      router.replace(nextPathname)
      router.refresh()
      toast.success("Organization switched")
    },
    onError: (error) => {
      agentRuntime.cancelOrganizationSwitch()
      showConsoleApiErrorToast(error, "Could not switch organization")
    },
  })
  const { isPending: organizationPending, mutate: activateOrganization } =
    organizationMutation
  const handleOrganizationChange = useCallback(
    (organizationId: string) => {
      if (
        me.organizations.some(
          (organization) =>
            organization.id === organizationId && organization.active
        )
      ) {
        return
      }

      const risks = agentRuntime.beginOrganizationSwitch()
      if (hasOrganizationSwitchRisks(risks)) {
        setPendingOrganizationSwitch({ organizationId, risks })
        return
      }
      activateOrganization(organizationId)
    },
    [activateOrganization, agentRuntime, me.organizations]
  )
  const cancelPendingOrganizationSwitch = useCallback(() => {
    setPendingOrganizationSwitch(undefined)
    agentRuntime.cancelOrganizationSwitch()
  }, [agentRuntime])
  const confirmPendingOrganizationSwitch = useCallback(() => {
    const target = pendingOrganizationSwitch?.organizationId
    setPendingOrganizationSwitch(undefined)
    if (target) activateOrganization(target)
  }, [activateOrganization, pendingOrganizationSwitch])
  const handleSwitchDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelPendingOrganizationSwitch()
    },
    [cancelPendingOrganizationSwitch]
  )
  const completeAccountSwitch = useCallback(async () => {
    await agentRuntime.completeOrganizationSwitch()
    agentRuntime.cancelOrganizationSwitch()
  }, [agentRuntime])

  return (
    <SidebarProvider data-console-shell="true" data-boundary-state="ready">
      <ConsoleRouteEffects contentRef={contentRef} pathname={pathname} />
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <MobileSidebarClose />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuLinkButton
                size="lg"
                tooltip="Enterprise SaaS"
                href={
                  activeOrganization
                    ? `/organization/${activeOrganization.slug}/dashboard`
                    : "/settings/organizations"
                }
              >
                <span className="flex aspect-square size-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                  <BlocksIcon aria-hidden="true" />
                </span>
                <span className="grid min-w-0 flex-1 text-left">
                  <span className="truncate font-semibold">
                    Enterprise SaaS
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Team workspace
                  </span>
                </span>
              </SidebarMenuLinkButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <OrganizationSwitcher
                organizations={me.organizations}
                activeOrganization={activeOrganization}
                pending={organizationPending}
                onChange={handleOrganizationChange}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <Suspense fallback={navigationFallback}>
            <ConsoleNavigation activeOrganization={contextOrganization} />
          </Suspense>
        </SidebarContent>

        <SidebarSeparator />
        <SidebarFooter>
          <UserMenu
            user={me.user}
            onOpenAccountSwitcher={openAccountSwitcher}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <ConsoleFrame>
        <ConsoleFrameHeader>
          <SidebarTrigger className="-ml-1" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {contextOrganization?.name ?? "Choose an organization"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {contextOrganization
                ? `${contextOrganization.memberCount} members`
                : me.organizations.length > 0
                  ? "Select a workspace to continue"
                  : "Create your first workspace to continue"}
            </p>
          </div>
          {hasOrganizationContextMismatch ? (
            <Badge variant="outline">Viewing another organization</Badge>
          ) : null}
          {contextOrganization ? (
            <Badge variant="secondary">
              {roleLabel(contextOrganization.role)}
            </Badge>
          ) : null}
          <ThemeSelector />
        </ConsoleFrameHeader>
        <ConsoleFrameContent contentRef={contentRef}>
          {children}
        </ConsoleFrameContent>
      </ConsoleFrame>

      <AccountSwitcherDialog
        currentUser={me.user}
        open={accountDialogOpen}
        onOpenChange={setAccountDialogOpen}
        onPrepareAgentSwitch={agentRuntime.beginOrganizationSwitch}
        onCancelAgentSwitch={agentRuntime.cancelOrganizationSwitch}
        onCompleteAgentSwitch={completeAccountSwitch}
      />
      <AlertDialog
        open={pendingOrganizationSwitch !== undefined}
        onOpenChange={handleSwitchDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard local Agent work and switch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A message, upload, approval, or unsaved Issue form is still
              active. Switching clears local unsent work. Images already
              uploaded to chat storage keep their normal short retention period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingOrganizationSwitch}>
              Stay here
            </AlertDialogCancel>
            <Button onClick={confirmPendingOrganizationSwitch}>
              Discard local draft and switch
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
}

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
}: {
  activeOrganization?: OrganizationSummary
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
      />
      {organizationNavigation.length > 0 ? (
        <NavigationGroup
          label="Organization"
          items={organizationNavigation}
          pathname={pathname}
        />
      ) : null}
      <NavigationGroup
        label="Settings"
        items={accountNavigation}
        pathname={pathname}
      />
    </>
  )
}

const NavigationGroup = ({
  label,
  items,
  pathname,
}: {
  label: string
  items: NavigationItem[]
  pathname: string
}) => (
  <SidebarGroup>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {items.map((item) => (
          <NavigationMenuItem
            key={item.href}
            item={item}
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
  active,
}: {
  item: NavigationItem
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
        href={item.href}
        onClick={handleNavigate}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuLinkButton>
    </SidebarMenuItem>
  )
}

type OrganizationSwitcherProps = {
  organizations: OrganizationSummary[]
  activeOrganization?: OrganizationSummary
  pending: boolean
  onChange: (organizationId: string) => void
}

const OrganizationSwitcher = ({
  organizations,
  activeOrganization,
  pending,
  onChange,
}: OrganizationSwitcherProps) => {
  const { isMobile, setOpenMobile } = useSidebar()
  const handleChange = useCallback(
    (organizationId: string) => {
      setOpenMobile(false)
      onChange(organizationId)
    },
    [onChange, setOpenMobile]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={organizationSwitcherTrigger}
        disabled={pending}
      >
        {pending ? (
          <span className="flex aspect-square size-8 items-center justify-center rounded-xl border bg-background">
            <Spinner />
          </span>
        ) : (
          <OrganizationProfileImage
            organization={activeOrganization ?? emptyOrganizationIdentity}
            className="size-8 border"
          />
        )}
        <span className="grid min-w-0 flex-1 text-left">
          <span className="truncate font-medium">
            {activeOrganization?.name ??
              (organizations.length > 0
                ? "Choose organization"
                : "No organization")}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {activeOrganization
              ? roleLabel(activeOrganization.role)
              : organizations.length > 0
                ? "Select a workspace"
                : "Create a workspace"}
          </span>
        </span>
        <ChevronsUpDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={isMobile ? "bottom" : "right"}
        className="max-h-[min(24rem,calc(100svh-2rem))] w-64 overflow-y-auto"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {organizations.map((organization) => (
            <OrganizationSwitcherItem
              key={organization.id}
              organization={organization}
              current={organization.id === activeOrganization?.id}
              onChange={handleChange}
            />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLinkItem href="/settings/organizations">
            <PlusIcon aria-hidden="true" />
            Create organization
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const OrganizationSwitcherItem = ({
  organization,
  current,
  onChange,
}: {
  organization: OrganizationSummary
  current: boolean
  onChange: (organizationId: string) => void
}) => {
  const selectOrganization = useCallback(
    () => onChange(organization.id),
    [onChange, organization.id]
  )

  return (
    <DropdownMenuItem onClick={selectOrganization}>
      <OrganizationProfileImage
        organization={organization}
        className="size-6"
      />
      <span className="min-w-0 flex-1 truncate">{organization.name}</span>
      {current ? <CheckIcon aria-label="Current organization" /> : null}
    </DropdownMenuItem>
  )
}

const ThemeSelector = () => {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const displayTheme = mounted ? theme : "system"

  useEffect(() => {
    setMounted(true)
  }, [])
  const selectLightTheme = useCallback(() => setTheme("light"), [setTheme])
  const selectDarkTheme = useCallback(() => setTheme("dark"), [setTheme])
  const selectSystemTheme = useCallback(() => setTheme("system"), [setTheme])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={themeSelectorTrigger}
        aria-label="Choose color theme"
      >
        {displayTheme === "dark" ? <MoonIcon aria-hidden="true" /> : null}
        {displayTheme === "light" ? <SunIcon aria-hidden="true" /> : null}
        {displayTheme !== "dark" && displayTheme !== "light" ? (
          <MonitorIcon aria-hidden="true" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuItem onClick={selectLightTheme}>
            <SunIcon aria-hidden="true" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={selectDarkTheme}>
            <MoonIcon aria-hidden="true" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={selectSystemTheme}>
            <MonitorIcon aria-hidden="true" />
            System
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const UserMenu = ({
  user,
  onOpenAccountSwitcher,
}: Pick<Me, "user"> & { onOpenAccountSwitcher: () => void }) => {
  const { setOpenMobile } = useSidebar()
  const openAccountSwitcher = useCallback(() => {
    setOpenMobile(false)
    onOpenAccountSwitcher()
  }, [onOpenAccountSwitcher, setOpenMobile])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={userMenuTrigger}>
        <UserProfileImage user={user} className="size-8" />
        <span className="grid min-w-0 flex-1 text-left">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </span>
        <EllipsisVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuItem onClick={openAccountSwitcher}>
            <CircleUserRoundIcon aria-hidden="true" />
            Switch account
          </DropdownMenuItem>
          <DropdownMenuLinkItem href="/auth/sign-in?add_account=1">
            <PlusIcon aria-hidden="true" />
            Add account
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem href="/settings/account">
            <SettingsIcon aria-hidden="true" />
            Account settings
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLinkItem href="/auth/sign-out">
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
