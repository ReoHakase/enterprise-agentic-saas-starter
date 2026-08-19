"use client"

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
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BlocksIcon, BookOpenIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import {
  Suspense,
  type RefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { SidebarMenuLinkButton } from "@/components/navigation-link/navigation-link"
import {
  type DeviceAccountsController,
  type Me,
  useDeviceAccountsController,
} from "@/features/account"
import {
  AgentFormRegistryProvider,
  AgentRuntimeProvider,
  hasOrganizationSwitchRisks,
  useAgentRuntimeState,
  type OrganizationSwitchRisks,
  AgentShell,
  AgentShellTrigger,
} from "@/features/agent"
import { withAgentThreadHref } from "@/features/issues"
import { useIssueSearchState } from "@/features/issues/search-params.client"
import {
  consumeOrganizationSwitchFlash,
  prepareOrganizationSwitch,
  queueOrganizationSwitchFlash,
  resolveOrganizationRouteContext,
  roleLabel,
} from "@/features/organizations"
import { getBrowserConsoleApi } from "@/lib/browser/console-api"

import { showConsoleApiErrorToast } from "../../error-toast"
import { rewriteOrganizationSwitchPathname } from "../../organization-switch-route"
import {
  ConsoleFrame,
  ConsoleFrameContent,
  ConsoleFrameHeader,
} from "../console-frame/console-frame"
import {
  organizationSwitcher as OrganizationSwitcher,
  themeSelector as ThemeSelector,
  userMenu as UserMenu,
} from "../console-shell-controls/console-shell-controls"
import {
  consoleNavigation as ConsoleNavigation,
  consoleRouteEffects as ConsoleRouteEffects,
  mobileSidebarClose as MobileSidebarClose,
  navigationFallback,
} from "../console-shell-navigation/console-shell-navigation"

type ConsoleShellProps = {
  me: Me
  children: ReactNode
}

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
  const { state: issueSearchState } = useIssueSearchState()
  const pathname = usePathname()
  const contentRef = useRef<HTMLDivElement>(null)
  const accountActionReturnFocusRef = useRef<HTMLButtonElement>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [pendingOrganizationSwitch, setPendingOrganizationSwitch] = useState<{
    organizationId: string
    risks: OrganizationSwitchRisks
  }>()
  useEffect(() => {
    if (consumeOrganizationSwitchFlash(globalThis.sessionStorage)) {
      toast.success("Organization switched")
    }
  }, [])
  const {
    activeOrganization,
    contextOrganization,
    contextMismatch: hasOrganizationContextMismatch,
  } = resolveOrganizationRouteContext(pathname, me.organizations)

  const organizationMutation = useMutation({
    mutationFn: (organizationId: string) =>
      getBrowserConsoleApi().activateOrganization(organizationId),
    onSuccess: async (_, organizationId) => {
      await agentRuntime.completeOrganizationSwitch()
      await prepareOrganizationSwitch(queryClient, organizationId)
      const nextOrganization = me.organizations.find(
        (organization) => organization.id === organizationId
      )
      const nextPathname = nextOrganization
        ? rewriteOrganizationSwitchPathname(pathname, nextOrganization.slug)
        : pathname
      // usePathname excludes the search string, so this also clears every
      // tenant query parameter, including agentThread. A client navigation
      // preserves shared layouts and can retain the previous tenant's `me`
      // props, so crossing tenant paths must discard the full React/RSC tree.
      if (nextPathname === pathname) {
        router.refresh()
        toast.success("Organization switched")
      } else {
        queueOrganizationSwitchFlash(globalThis.sessionStorage)
        globalThis.location.assign(nextPathname)
      }
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
  const accountController = useDeviceAccountsController({
    currentUser: me.user,
    enabled: accountMenuOpen,
    onPrepareIdentityChange: agentRuntime.beginOrganizationSwitch,
    onAbortIdentityChange: agentRuntime.abortOrganizationSwitch,
    onCancelIdentityChange: agentRuntime.cancelOrganizationSwitch,
    onCompleteIdentityChange: completeAccountSwitch,
  })

  return (
    <SidebarProvider data-console-shell="true" data-boundary-state="ready">
      <ConsoleRouteEffects contentRef={contentRef} pathname={pathname} />
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <MobileSidebarClose />
          <SidebarMenu className="group-data-[collapsible=icon]:gap-2">
            <SidebarMenuItem>
              <SidebarMenuLinkButton
                size="lg"
                tooltip="Enterprise SaaS"
                href={withAgentThreadHref(
                  activeOrganization
                    ? `/organization/${activeOrganization.slug}/dashboard`
                    : "/settings/organizations",
                  issueSearchState.agentThread
                )}
              >
                <span
                  data-console-identity="brand"
                  className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"
                >
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
                agentThread={issueSearchState.agentThread}
                pending={organizationPending}
                onChange={handleOrganizationChange}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <Suspense fallback={navigationFallback}>
            <ConsoleNavigation
              activeOrganization={contextOrganization}
              agentThread={issueSearchState.agentThread}
            />
          </Suspense>
        </SidebarContent>

        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuLinkButton
                href="/docs"
                tooltip="Documentation"
                data-console-documentation-link
              >
                <BookOpenIcon aria-hidden="true" />
                <span>Documentation</span>
              </SidebarMenuLinkButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <UserMenu
                user={me.user}
                agentThread={issueSearchState.agentThread}
                accountController={accountController}
                open={accountMenuOpen}
                onOpenChange={setAccountMenuOpen}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <ConsoleFrame>
        <ConsoleFrameHeader>
          <SidebarTrigger ref={accountActionReturnFocusRef} className="-ml-1" />
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
          <AgentShellTrigger disabled={!activeOrganization} />
          <ThemeSelector />
        </ConsoleFrameHeader>
        <ConsoleFrameContent contentRef={contentRef}>
          {children}
        </ConsoleFrameContent>
      </ConsoleFrame>

      <AgentShell
        userId={me.user.id}
        organization={activeOrganization}
        contextMismatch={hasOrganizationContextMismatch}
      />

      <AccountMenuRiskDialog
        controller={accountController}
        returnFocusRef={accountActionReturnFocusRef}
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

const AccountMenuRiskDialog = ({
  controller,
  returnFocusRef,
}: {
  controller: DeviceAccountsController
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) => {
  const {
    actionMutation,
    confirmRiskAction,
    handleRiskDialogOpenChange,
    riskAction,
  } = controller
  const signOut = riskAction?.kind === "sign-out"
  const restoreStableFocus = useCallback(() => {
    queueMicrotask(() => returnFocusRef.current?.focus())
  }, [returnFocusRef])
  const onRiskDialogOpenChange = useCallback(
    (open: boolean) => {
      handleRiskDialogOpenChange(open)
      if (!open) restoreStableFocus()
    },
    [handleRiskDialogOpenChange, restoreStableFocus]
  )

  return (
    <AlertDialog
      open={riskAction !== undefined}
      onOpenChange={onRiskDialogOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {signOut
              ? "Discard local Agent work and sign out?"
              : "Discard local Agent work and switch account?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The old session Agent context will be revoked first. Unsent
            messages, uploads, approvals, and Issue form drafts are cleared only
            after the account operation succeeds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={actionMutation.isPending}>
            Stay here
          </AlertDialogCancel>
          <AlertDialogAction
            variant={signOut ? "destructive" : "default"}
            disabled={actionMutation.isPending}
            onClick={confirmRiskAction}
          >
            {actionMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            {signOut
              ? "Discard local draft and sign out"
              : "Discard local draft and switch"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
