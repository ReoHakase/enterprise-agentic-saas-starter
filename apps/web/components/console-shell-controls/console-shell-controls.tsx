"use client"

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
  SidebarMenuButton,
  useSidebar,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleUserRoundIcon,
  EllipsisVerticalIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useState } from "react"

import { DropdownMenuLinkItem } from "@/components/navigation-link/navigation-link"
import { OrganizationProfileImage } from "@/components/organization-identity/organization-identity"
import { UserProfileImage } from "@/components/user-identity/user-identity"
import type { Me } from "@/features/account"
import { withAgentThreadHref } from "@/features/issues"
import { roleLabel, type OrganizationSummary } from "@/features/organizations"

const organizationSwitcherTrigger = (
  <SidebarMenuButton size="lg" tooltip="Switch organization" />
)
const themeSelectorTrigger = <Button variant="ghost" size="icon-sm" />
const userMenuTrigger = <SidebarMenuButton size="lg" tooltip="Account menu" />
const emptyOrganizationIdentity = { name: "Organization" }

type OrganizationSwitcherProps = {
  organizations: OrganizationSummary[]
  activeOrganization?: OrganizationSummary
  agentThread: string
  pending: boolean
  onChange: (organizationId: string) => void
}

const OrganizationSwitcher = ({
  organizations,
  activeOrganization,
  agentThread,
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
          <DropdownMenuLinkItem
            href={withAgentThreadHref("/settings/organizations", agentThread)}
          >
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
  agentThread,
  onOpenAccountSwitcher,
}: Pick<Me, "user"> & {
  agentThread: string
  onOpenAccountSwitcher: () => void
}) => {
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
          <DropdownMenuLinkItem
            href={withAgentThreadHref("/settings/account", agentThread)}
          >
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

export {
  OrganizationSwitcher as organizationSwitcher,
  ThemeSelector as themeSelector,
  UserMenu as userMenu,
}
