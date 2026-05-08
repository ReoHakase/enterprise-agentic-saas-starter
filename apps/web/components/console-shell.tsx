"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
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
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  Building2Icon,
  EllipsisVerticalIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  UserCircleIcon,
  SunIcon,
  LogOutIcon,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react"

import { getSafeAvatarUrl } from "@/lib/avatar-url"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { roleLabel, type Me, type OrganizationSummary } from "@/lib/console-api"

type ConsoleShellProps = {
  me: Me
  children: ReactNode
}

const dashboardNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/dashboard/todos", label: "Todos", icon: ListTodoIcon },
] as const

export const ConsoleShell = ({ me, children }: ConsoleShellProps) => {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const activeOrganization =
    me.organizations.find((organization) => organization.active) ??
    me.organizations[0]

  const handleOrganizationChange = useCallback(
    (organizationId: string | null) => {
      if (!organizationId) {
        return
      }

      startTransition(async () => {
        await browserConsoleApi.activateOrganization(organizationId)
        router.refresh()
      })
    },
    [router]
  )

  return (
    <SidebarProvider>
      <Sidebar className="border-sidebar-border/70 bg-sidebar/95">
        <SidebarHeader>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-4xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-sidebar-primary/20">
              <Building2Icon />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Enterprise SaaS</p>
              <p className="truncate text-xs text-sidebar-foreground/70">
                Organization console
              </p>
            </div>
          </div>
          <OrganizationSwitcher
            organizations={me.organizations}
            activeOrganization={activeOrganization}
            pending={pending}
            onChange={handleOrganizationChange}
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {dashboardNavItems.map((item) => (
                  <NavMenuItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={pathname === item.href}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Organization</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavMenuItem
                  href="/settings/organizations"
                  label="Organizations"
                  icon={Building2Icon}
                  active={pathname === "/settings/organizations"}
                />
                {activeOrganization ? (
                  <NavMenuItem
                    href={`/organization/${activeOrganization.id}/members`}
                    label="Members"
                    icon={ShieldIcon}
                    active={pathname?.includes("/members") ?? false}
                  />
                ) : null}
                {activeOrganization?.permissions.canEditOrganization ? (
                  <NavMenuItem
                    href={`/organization/${activeOrganization.id}/settings`}
                    label="Org settings"
                    icon={SettingsIcon}
                    active={pathname?.endsWith("/settings") ?? false}
                  />
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <UserMenu user={me.user} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-[linear-gradient(135deg,var(--background)_0%,color-mix(in_oklab,var(--primary)_7%,var(--background))_48%,var(--background)_100%)]">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-6">
          <SidebarTrigger className="md:hidden" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {activeOrganization?.name ?? "No organization"}
            </p>
          </div>
          <ThemeSelector />
          {activeOrganization ? (
            <Badge variant="secondary">
              {roleLabel(activeOrganization.role)}
            </Badge>
          ) : null}
        </header>
        <div className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

type NavMenuItemProps = {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
}

const NavMenuItem = ({ href, label, icon: Icon, active }: NavMenuItemProps) => (
  <SidebarMenuItem>
    <Link
      href={href}
      className={cn(
        "flex h-9 min-w-0 items-center gap-2 rounded-4xl px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active &&
          "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm"
      )}
    >
      <Icon className="size-4" />
      <span className="truncate">{label}</span>
    </Link>
  </SidebarMenuItem>
)

type OrganizationSwitcherProps = {
  organizations: OrganizationSummary[]
  activeOrganization?: OrganizationSummary
  pending: boolean
  onChange: (organizationId: string | null) => void
}

const OrganizationSwitcher = ({
  organizations,
  activeOrganization,
  pending,
  onChange,
}: OrganizationSwitcherProps) => (
  <Select
    value={activeOrganization?.id ?? ""}
    onValueChange={onChange}
    disabled={pending || organizations.length === 0}
  >
    <SelectTrigger className="w-full min-w-0">
      <span className="min-w-0 flex-1 truncate text-left">
        {activeOrganization?.name ?? "Select organization"}
      </span>
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {organizations.map((organization) => (
          <SelectItem key={organization.id} value={organization.id}>
            {organization.name}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
)

const ThemeSelector = () => {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const displayTheme = mounted ? theme : "system"
  const setLightTheme = useCallback(() => setTheme("light"), [setTheme])
  const setDarkTheme = useCallback(() => setTheme("dark"), [setTheme])
  const setSystemTheme = useCallback(() => setTheme("system"), [setTheme])

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label="Select theme"
      >
        {displayTheme === "dark" ? <MoonIcon /> : null}
        {displayTheme === "light" ? <SunIcon /> : null}
        {displayTheme !== "dark" && displayTheme !== "light" ? (
          <MonitorIcon />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuItem onClick={setLightTheme}>
            <SunIcon data-icon="inline-start" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={setDarkTheme}>
            <MoonIcon data-icon="inline-start" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={setSystemTheme}>
            <MonitorIcon data-icon="inline-start" />
            System
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const UserMenu = ({ user }: Pick<Me, "user">) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="ghost"
          className="h-auto w-full justify-start px-2 py-2"
        />
      }
    >
      <Avatar className="size-10">
        <AvatarImage src={getSafeAvatarUrl(user.image)} alt={user.name} />
        <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 text-left">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {user.email}
        </span>
      </span>
      <EllipsisVerticalIcon className="size-4 text-muted-foreground" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" className="w-64">
      <DropdownMenuGroup>
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuItem render={<Link href="/settings/account" />}>
          <UserCircleIcon data-icon="inline-start" />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/auth/sign-out" />}>
          <LogOutIcon data-icon="inline-start" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)
