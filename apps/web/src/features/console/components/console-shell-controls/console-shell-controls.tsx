"use client"

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
  SidebarMenuButton,
  useSidebar,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  CheckIcon,
  ChevronsUpDownIcon,
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
import { UserProfileImage } from "@/components/user-identity/user-identity"
import type {
  DeviceAccount,
  DeviceAccountsController,
  Me,
} from "@/features/account"
import { withAgentThreadHref } from "@/features/issues"
import {
  OrganizationProfileImage,
  roleLabel,
  type OrganizationSummary,
} from "@/features/organizations"

const organizationSwitcherTrigger = (
  <SidebarMenuButton
    size="lg"
    tooltip="Switch organization"
    className="group-data-[collapsible=icon]:rounded-[22%]"
  />
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
          <span
            data-console-identity="organization"
            className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-xl border bg-background group-data-[collapsible=icon]:rounded-[22%]"
          >
            <Spinner />
          </span>
        ) : (
          <OrganizationProfileImage
            data-console-identity="organization"
            organization={activeOrganization ?? emptyOrganizationIdentity}
            className="size-8 shrink-0 border"
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
  accountController,
  onOpenChange,
  open,
}: Pick<Me, "user"> & {
  agentThread: string
  accountController: DeviceAccountsController
  onOpenChange: (open: boolean) => void
  open: boolean
}) => {
  const { setOpenMobile } = useSidebar()
  const {
    accounts,
    accountsQuery,
    actionMutation,
    currentAccount,
    pendingToken,
    requestSignOut,
    requestSwitch,
    retryAccounts,
  } = accountController
  const closeMobileSidebar = useCallback(() => {
    setOpenMobile(false)
  }, [setOpenMobile])
  const switchAccount = useCallback(
    (account: DeviceAccount) => {
      closeMobileSidebar()
      requestSwitch(account)
    },
    [closeMobileSidebar, requestSwitch]
  )
  const signOut = useCallback(() => {
    closeMobileSidebar()
    requestSignOut()
  }, [closeMobileSidebar, requestSignOut])
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={userMenuTrigger}>
        <UserProfileImage
          data-console-identity="user"
          user={user}
          className="size-8"
        />
        <span className="grid min-w-0 flex-1 text-left">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </span>
        <EllipsisVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="max-h-[min(30rem,calc(100svh-2rem))] w-72"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Accounts on this device</DropdownMenuLabel>
          {accountsQuery.isPending ? (
            <DropdownMenuItem disabled>
              <Spinner />
              Loading accounts
            </DropdownMenuItem>
          ) : null}
          {accountsQuery.isError ? (
            <DropdownMenuItem onClick={retryAccounts}>
              Try loading accounts again
            </DropdownMenuItem>
          ) : null}
          {!accountsQuery.isPending && !accountsQuery.isError
            ? accounts.map((account) => (
                <DeviceAccountMenuItem
                  key={account.session.token}
                  account={account}
                  current={
                    currentAccount?.session.token === account.session.token
                  }
                  disabled={actionMutation.isPending}
                  pending={pendingToken === account.session.token}
                  onSwitch={switchAccount}
                />
              ))
            : null}
          {!accountsQuery.isPending &&
          !accountsQuery.isError &&
          accounts.length === 0 ? (
            <DropdownMenuItem disabled>No saved accounts</DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
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
          <DropdownMenuItem
            variant="destructive"
            disabled={
              actionMutation.isPending ||
              accountsQuery.isPending ||
              !currentAccount
            }
            onClick={signOut}
          >
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const DeviceAccountMenuItem = ({
  account,
  current,
  disabled,
  pending,
  onSwitch,
}: {
  account: DeviceAccount
  current: boolean
  disabled: boolean
  pending: boolean
  onSwitch: (account: DeviceAccount) => void
}) => {
  const switchAccount = useCallback(() => {
    if (!current && !disabled) onSwitch(account)
  }, [account, current, disabled, onSwitch])

  return (
    <DropdownMenuItem
      aria-current={current ? "true" : undefined}
      className={current ? "data-disabled:opacity-100" : undefined}
      disabled={current || disabled}
      onClick={switchAccount}
    >
      <UserProfileImage user={account.user} className="size-6" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{account.user.name}</span>
        <span className="block truncate text-xs font-normal text-muted-foreground">
          {account.user.email}
        </span>
      </span>
      {pending ? <Spinner aria-label="Switching account" /> : null}
      {current ? <Badge variant="secondary">Current</Badge> : null}
      {current ? <CheckIcon aria-label="Current account" /> : null}
    </DropdownMenuItem>
  )
}

export {
  OrganizationSwitcher as organizationSwitcher,
  ThemeSelector as themeSelector,
  UserMenu as userMenu,
}
