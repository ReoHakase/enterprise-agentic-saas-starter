import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { AlertTriangleIcon } from "lucide-react"
import { fn } from "storybook/test"

import { MessageResponse } from "../ai-elements/message/message"
import { AppState, RouteLoading } from "../app-state/app-state"
import {
  ConsoleFrame,
  ConsoleFrameContent,
  ConsoleFrameHeader,
} from "../console-frame/console-frame"
import {
  ConsoleContentError,
  ConsoleShellError,
} from "../console-route-error-boundary.client/console-route-error-boundary.client"
import {
  ConsoleBoundaryShell,
  ConsoleShellSkeleton,
} from "../console-route-suspense/console-route-suspense"
import { LinkButton } from "../link-button/link-button"
import { LocalDate } from "../local-date/local-date"
import {
  DropdownMenuLinkItem,
  SidebarMenuLinkButton,
} from "../navigation-link/navigation-link"
import { OrganizationProfileImage } from "../organization-identity/organization-identity"
import {
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
  PageShell,
} from "../page-shell/page-shell"
import { Providers } from "../providers/providers"
import {
  AuthRouteError,
  InvitationRouteError,
  RootRouteError,
  StandaloneRouteError,
} from "../public-route-error-boundary.client/public-route-error-boundary.client"
import {
  AuthRouteFrame,
  InvitationRouteFrame,
} from "../public-route-frame/public-route-frame"
import {
  AuthRouteLoading,
  InvitationRouteLoading,
  RootRouteLoading,
} from "../public-route-suspense/public-route-suspense"
import { QueryHydrationBoundary } from "../query-hydration-boundary/query-hydration-boundary"
import { ThemeProvider } from "../theme-provider/theme-provider"
import { UserIdentity, UserProfileImage } from "../user-identity/user-identity"

const reset = fn()
const dehydratedState = { mutations: [], queries: [] }
const menuTrigger = <Button variant="outline" />
const catalogueOrganization = { name: "Acme Cloud", profileImage: null }
const catalogueUser = {
  name: "Avery Stone",
  email: "avery@example.test",
  profileImage: null,
}

const LayoutCatalogue = () => (
  <SidebarProvider>
    <ConsoleFrame>
      <ConsoleFrameHeader>
        <span className="font-medium">Acme workspace</span>
      </ConsoleFrameHeader>
      <ConsoleFrameContent>
        <PageShell
          title="Issues"
          description="Track tenant-scoped work."
          actionHref="/organization/acme/issues/new"
          actionLabel="New issue"
        >
          <PageHeader>
            <PageHeaderCopy>
              <h2 className="font-medium">Current sprint</h2>
              <PageHeaderDescription>
                Three issues need review.
              </PageHeaderDescription>
            </PageHeaderCopy>
            <LinkButton href="/organization/acme/issues">
              View issues
            </LinkButton>
          </PageHeader>
          <div className="mt-6 flex flex-wrap gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger render={menuTrigger}>
                Open navigation
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLinkItem href="/settings/account">
                  Account
                </DropdownMenuLinkItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuLinkButton href="/organization/acme/members">
                  Members
                </SidebarMenuLinkButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </PageShell>
      </ConsoleFrameContent>
    </ConsoleFrame>
  </SidebarProvider>
)

const IdentityCatalogue = () => (
  <div className="grid max-w-sm gap-5 rounded-2xl border p-5">
    <OrganizationProfileImage organization={catalogueOrganization} />
    <UserIdentity user={catalogueUser} />
    <UserProfileImage user={catalogueUser} />
    <LocalDate includeTime value="2026-07-24T09:30:00.000Z" />
  </div>
)

const ProviderCatalogue = () => (
  <Providers>
    <ThemeProvider forcedTheme="light">
      <QueryHydrationBoundary state={dehydratedState}>
        <p>Application providers are ready.</p>
      </QueryHydrationBoundary>
    </ThemeProvider>
  </Providers>
)

const meta = {
  title: "Web/Shared Component Catalogue",
  component: LayoutCatalogue,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LayoutCatalogue>

export default meta
type Story = StoryObj<typeof meta>

export const ConsoleLayout: Story = {
  render: () => <LayoutCatalogue />,
}

export const Identities: Story = {
  render: () => <IdentityCatalogue />,
}

export const EmptyAndLoading: Story = {
  render: () => (
    <div className="grid gap-6">
      <AppState
        icon={AlertTriangleIcon}
        title="No organization selected"
        description="Choose a workspace to continue."
      />
      <RouteLoading label="Loading issues" variant="issues" />
    </div>
  ),
}

export const ConsoleBoundaries: Story = {
  render: () => (
    <ConsoleBoundaryShell state="loading">
      <RouteLoading variant="dashboard" />
    </ConsoleBoundaryShell>
  ),
}

export const ConsoleLoadingBoundary: Story = {
  render: () => <ConsoleShellSkeleton />,
}

export const ConsoleContentFailure: Story = {
  render: () => <ConsoleContentError reset={reset} />,
}

export const ConsoleShellFailure: Story = {
  render: () => <ConsoleShellError reset={reset} />,
}

export const AuthenticationFrame: Story = {
  render: () => (
    <AuthRouteFrame>
      <div className="rounded-2xl border p-5">Authentication form</div>
    </AuthRouteFrame>
  ),
}

export const InvitationFrame: Story = {
  render: () => (
    <InvitationRouteFrame>
      <div className="rounded-2xl border p-5">Invitation</div>
    </InvitationRouteFrame>
  ),
}

export const AuthenticationLoading: Story = {
  render: () => <AuthRouteLoading />,
}

export const InvitationLoading: Story = {
  render: () => <InvitationRouteLoading />,
}

export const RootLoading: Story = {
  render: () => <RootRouteLoading />,
}

export const AuthenticationFailure: Story = {
  render: () => <AuthRouteError reset={reset} />,
}

export const InvitationFailure: Story = {
  render: () => <InvitationRouteError reset={reset} />,
}

export const StandaloneFailure: Story = {
  render: () => <StandaloneRouteError reset={reset} />,
}

export const RootFailure: Story = {
  render: () => <RootRouteError reset={reset} />,
}

export const ApplicationProviders: Story = {
  render: () => <ProviderCatalogue />,
}

export const AgentMessageResponse: Story = {
  render: () => (
    <div className="max-w-2xl rounded-2xl border p-5">
      <MessageResponse>
        {
          "## Deployment summary\n\n- All checks passed\n- No production changes were applied"
        }
      </MessageResponse>
    </div>
  ),
}
