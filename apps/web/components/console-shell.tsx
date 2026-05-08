"use client"

import {
  Avatar,
  AvatarFallback,
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
  LayoutDashboardIcon,
  ListTodoIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
  UserIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { type ReactNode, useEffect, useState, useTransition } from "react"

import { browserConsoleApi } from "@/lib/browser/console-api"
import { roleLabel, type Me, type OrganizationSummary } from "@/lib/console-api"

type ConsoleShellProps = {
  me: Me
  children: ReactNode
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/dashboard/todos", label: "Todos", icon: ListTodoIcon },
  { href: "/settings/profile", label: "User settings", icon: UserIcon },
  {
    href: "/settings/organizations",
    label: "Organizations",
    icon: Building2Icon,
  },
] as const

export const ConsoleShell = ({ me, children }: ConsoleShellProps) => {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const activeOrganization =
    me.organizations.find((organization) => organization.active) ??
    me.organizations[0]

  const handleOrganizationChange = (organizationId: string | null) => {
    if (!organizationId) {
      return
    }

    startTransition(async () => {
      await browserConsoleApi.activateOrganization(organizationId)
      router.refresh()
    })
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
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
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-9 min-w-0 items-center gap-2 rounded-2xl px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        pathname === item.href &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </SidebarMenuItem>
                ))}
                {activeOrganization ? (
                  <SidebarMenuItem>
                    <Link
                      href={`/organization/${activeOrganization.id}/members`}
                      className={cn(
                        "flex h-9 min-w-0 items-center gap-2 rounded-2xl px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        pathname?.includes("/members") &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      )}
                    >
                      <ShieldIcon />
                      <span className="truncate">Members</span>
                    </Link>
                  </SidebarMenuItem>
                ) : null}
                {activeOrganization?.permissions.canEditOrganization ? (
                  <SidebarMenuItem>
                    <Link
                      href={`/organization/${activeOrganization.id}/settings`}
                      className={cn(
                        "flex h-9 min-w-0 items-center gap-2 rounded-2xl px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        pathname?.endsWith("/settings") &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      )}
                    >
                      <SettingsIcon />
                      <span className="truncate">Org settings</span>
                    </Link>
                  </SidebarMenuItem>
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
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
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
        <div className="min-w-0 flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

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
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <SunIcon data-icon="inline-start" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <MoonIcon data-icon="inline-start" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
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
      render={<Button variant="ghost" className="w-full justify-start" />}
    >
      <Avatar size="sm">
        <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-left">{user.email}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
        <DropdownMenuItem render={<Link href="/settings/profile" />}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings/sessions" />}>
          Sessions
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/auth/sign-out" />}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)
