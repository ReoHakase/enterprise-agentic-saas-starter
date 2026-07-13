"use client"

import { useAuth } from "@better-auth-ui/react"
import type { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@enterprise-agentic-saas/ui/components/dialog"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  BlocksIcon,
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleUserRoundIcon,
  EllipsisVerticalIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  UserCircleIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { getSafeAvatarUrl } from "@/lib/avatar-url"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { roleLabel, type Me, type OrganizationSummary } from "@/lib/console-api"

type ConsoleShellProps = {
  me: Me
  children: ReactNode
}

type AuthClient = ReturnType<typeof createAuthClientForBaseUrl>

type DeviceAccount = {
  session: {
    token: string
  }
  user: {
    id: string
    name: string
    email: string
    image?: string | null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isMultiSessionAuthClient = (value: unknown): value is AuthClient => {
  if (!isRecord(value) || !isRecord(value.multiSession)) {
    return false
  }

  return (
    typeof value.multiSession.listDeviceSessions === "function" &&
    typeof value.multiSession.setActive === "function" &&
    typeof value.multiSession.revoke === "function"
  )
}

const isDeviceAccount = (value: unknown): value is DeviceAccount =>
  isRecord(value) &&
  isRecord(value.session) &&
  typeof value.session.token === "string" &&
  isRecord(value.user) &&
  typeof value.user.id === "string" &&
  typeof value.user.name === "string" &&
  typeof value.user.email === "string"

type NavigationItem = {
  href: string
  label: string
  icon: LucideIcon
}

const workspaceNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/todos", label: "Issues", icon: ListTodoIcon },
]

const accountNavigation: NavigationItem[] = [
  {
    href: "/settings/organizations",
    label: "Organizations",
    icon: Building2Icon,
  },
  { href: "/settings/account", label: "Account", icon: UserCircleIcon },
]

export const ConsoleShell = ({ me, children }: ConsoleShellProps) => {
  const router = useRouter()
  const [organizationPending, startOrganizationTransition] = useTransition()
  const activeOrganization = me.organizations.find(
    (organization) => organization.active
  )

  const handleOrganizationChange = useCallback(
    (organizationId: string) => {
      if (
        me.organizations.find(
          (organization) =>
            organization.id === organizationId && organization.active
        )
      ) {
        return
      }

      startOrganizationTransition(async () => {
        try {
          await browserConsoleApi.activateOrganization(organizationId)
          router.refresh()
          toast.success("Organization switched")
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not switch organization"
          )
        }
      })
    },
    [me.organizations, router]
  )

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Enterprise SaaS"
                render={<Link href="/dashboard" />}
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
              </SidebarMenuButton>
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
          <Suspense fallback={<NavigationFallback />}>
            <ConsoleNavigation activeOrganization={activeOrganization} />
          </Suspense>
        </SidebarContent>

        <SidebarSeparator />
        <SidebarFooter>
          <UserMenu user={me.user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {activeOrganization?.name ?? "Choose an organization"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {activeOrganization
                ? `${activeOrganization.memberCount} members`
                : me.organizations.length > 0
                  ? "Select a workspace to continue"
                  : "Create your first workspace to continue"}
            </p>
          </div>
          {activeOrganization ? (
            <Badge variant="secondary">
              {roleLabel(activeOrganization.role)}
            </Badge>
          ) : null}
          <ThemeSelector />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

const NavigationFallback = () => (
  <SidebarGroup>
    <SidebarGroupLabel>Workspace</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

const ConsoleNavigation = ({
  activeOrganization,
}: {
  activeOrganization?: OrganizationSummary
}) => {
  const pathname = usePathname()
  const organizationNavigation: NavigationItem[] = activeOrganization
    ? [
        {
          href: `/organization/${activeOrganization.id}/members`,
          label: "Members",
          icon: UsersRoundIcon,
        },
        ...(activeOrganization.permissions.canEditOrganization
          ? [
              {
                href: `/organization/${activeOrganization.id}/settings`,
                label: "Organization settings",
                icon: SettingsIcon,
              } satisfies NavigationItem,
            ]
          : []),
      ]
    : []

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

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={<Link href={item.href} />}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuButton>
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
}: OrganizationSwitcherProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<SidebarMenuButton size="lg" tooltip="Switch organization" />}
      disabled={pending}
    >
      <span className="flex aspect-square size-8 items-center justify-center rounded-xl border bg-background">
        {pending ? <Spinner /> : <Building2Icon aria-hidden="true" />}
      </span>
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
    <DropdownMenuContent align="start" side="right" className="w-64">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((organization) => (
          <DropdownMenuItem
            key={organization.id}
            onClick={() => onChange(organization.id)}
          >
            <Building2Icon aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{organization.name}</span>
            {organization.id === activeOrganization?.id ? (
              <CheckIcon aria-label="Current organization" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem render={<Link href="/settings/organizations" />}>
          <PlusIcon aria-hidden="true" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)

const ThemeSelector = () => {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const displayTheme = mounted ? theme : "system"

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" />}
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
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <SunIcon aria-hidden="true" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <MoonIcon aria-hidden="true" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <MonitorIcon aria-hidden="true" />
            System
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const UserMenu = ({ user }: Pick<Me, "user">) => {
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuButton size="lg" tooltip="Account menu" />}
        >
          <Avatar className="size-8 rounded-xl">
            <AvatarImage src={getSafeAvatarUrl(user.image)} alt={user.name} />
            <AvatarFallback className="rounded-xl">
              {user.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
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
            <DropdownMenuItem onClick={() => setAccountDialogOpen(true)}>
              <CircleUserRoundIcon aria-hidden="true" />
              Switch account
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link href="/auth/sign-in?add_account=1" />}
            >
              <PlusIcon aria-hidden="true" />
              Add account
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/account" />}>
              <SettingsIcon aria-hidden="true" />
              Account settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/auth/sign-out" />}>
              <LogOutIcon aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AccountSwitcherDialog
        currentUser={user}
        open={accountDialogOpen}
        onOpenChange={setAccountDialogOpen}
      />
    </>
  )
}

const AccountSwitcherDialog = ({
  currentUser,
  open,
  onOpenChange,
}: {
  currentUser: Me["user"]
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const { authClient: authClientValue } = useAuth()
  const router = useRouter()
  const [accounts, setAccounts] = useState<DeviceAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [pendingToken, setPendingToken] = useState<string>()
  const [revokeTarget, setRevokeTarget] = useState<DeviceAccount>()

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      if (!isMultiSessionAuthClient(authClientValue)) {
        throw new Error("Account switching is not available")
      }
      const result = await authClientValue.multiSession.listDeviceSessions()
      if (result.error) {
        throw new Error(result.error.message)
      }
      setAccounts((result.data ?? []).filter(isDeviceAccount))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load accounts"
      )
    } finally {
      setLoading(false)
    }
  }, [authClientValue])

  useEffect(() => {
    if (open) {
      void loadAccounts()
    }
  }, [loadAccounts, open])

  const switchAccount = async (account: DeviceAccount) => {
    setPendingToken(account.session.token)
    try {
      if (!isMultiSessionAuthClient(authClientValue)) {
        throw new Error("Account switching is not available")
      }
      const result = await authClientValue.multiSession.setActive({
        sessionToken: account.session.token,
      })
      if (result.error) {
        throw new Error(result.error.message)
      }
      onOpenChange(false)
      router.refresh()
      toast.success(`Switched to ${account.user.email}`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not switch account"
      )
    } finally {
      setPendingToken(undefined)
    }
  }

  const revokeAccount = async () => {
    if (!revokeTarget) {
      return
    }

    setPendingToken(revokeTarget.session.token)
    try {
      if (!isMultiSessionAuthClient(authClientValue)) {
        throw new Error("Account switching is not available")
      }
      const result = await authClientValue.multiSession.revoke({
        sessionToken: revokeTarget.session.token,
      })
      if (result.error) {
        throw new Error(result.error.message)
      }
      toast.success(`${revokeTarget.user.email} was removed`)
      setRevokeTarget(undefined)
      await loadAccounts()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove account"
      )
    } finally {
      setPendingToken(undefined)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Switch account</DialogTitle>
            <DialogDescription>
              Move between signed-in accounts on this device without mixing
              organization data.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Spinner />
                Loading accounts
              </div>
            ) : null}

            {!loading && accounts.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleUserRoundIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No additional accounts</EmptyTitle>
                  <EmptyDescription>
                    Add another account to switch without signing out.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}

            {!loading
              ? accounts.map((account) => {
                  const current = account.user.id === currentUser.id
                  const pending = pendingToken === account.session.token

                  return (
                    <div
                      key={account.session.token}
                      className="flex min-w-0 items-center gap-3 rounded-xl border p-3"
                    >
                      <Avatar className="size-10">
                        <AvatarImage
                          src={getSafeAvatarUrl(account.user.image)}
                          alt={account.user.name}
                        />
                        <AvatarFallback>
                          {account.user.name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {account.user.name}
                          </p>
                          {current ? (
                            <Badge variant="secondary">Current</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {account.user.email}
                        </p>
                      </div>
                      {current ? null : (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pendingToken !== undefined}
                            onClick={() => switchAccount(account)}
                          >
                            {pending ? (
                              <Spinner data-icon="inline-start" />
                            ) : null}
                            Switch
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={pendingToken !== undefined}
                            aria-label={`Remove ${account.user.email} from this device`}
                            onClick={() => setRevokeTarget(account)}
                          >
                            <LogOutIcon aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })
              : null}
          </div>

          <DialogFooter>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/auth/sign-in?add_account=1" />}
            >
              <PlusIcon data-icon="inline-start" />
              Add account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revokeTarget !== undefined}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRevokeTarget(undefined)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove account from this device?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.user.email} will be signed out on this device. The
              account and its organization data will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingToken !== undefined}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingToken !== undefined}
              onClick={revokeAccount}
            >
              {pendingToken ? <Spinner data-icon="inline-start" /> : null}
              Remove account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
