import { MCP_OAUTH_SCOPES } from "@enterprise-agentic-saas/auth/client"
import { http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { fictionalDeviceAccounts } from "@/features/account/test-support/fixtures"
import { AuthStoryScope } from "@/features/auth/test-support/fixtures"

import { fictionalOrganizations } from "../../../organizations/test-support/fixtures"
import { parseMcpOAuthScopes } from "../../query"
import {
  McpOAuthConsentView,
  McpOAuthOrganizationView,
} from "./mcp-oauth-authorization"
import { McpOAuthScopeConsentStoryFixture } from "./test-support/mcp-oauth-authorization-story-fixture"

const selectOrganizationPending = fn()
const decide = fn()
const decideDenied = fn()
const consentScopes = parseMcpOAuthScopes(MCP_OAUTH_SCOPES.join(" ")) ?? []
const organizationOptions = fictionalOrganizations
const noOrganizations = [] as const
const currentUser = {
  id: "user-current",
  name: "Current User",
  email: "current@example.test",
  profileImage: null,
}
const organizationViewProps = {
  addAccountHref:
    "/auth/sign-in?add_account=1&redirectTo=%2Foauth%2Forganization",
  currentUser,
  returnTo: "/oauth/organization",
} as const
const consentViewProps = {
  addAccountHref: "/auth/sign-in?add_account=1&redirectTo=%2Foauth%2Fconsent",
  currentUser,
  returnTo: "/oauth/consent",
} as const

const meta = preview.meta({
  title: "Web/MCP OAuth/Authorization",
  component: McpOAuthOrganizationView,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AuthStoryScope>
        <div className="mx-auto flex min-w-0 justify-center">
          <Story />
        </div>
      </AuthStoryScope>
    ),
  ],
})

export const OrganizationSelection = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(
          fictionalDeviceAccounts.map((account) => ({
            session: account.session,
            user: {
              id: account.user.id,
              name: account.user.name,
              email: account.user.email,
              image: account.user.profileImage,
            },
          }))
        )
      )
    )
  },
  args: {
    ...organizationViewProps,
    organizations: organizationOptions,
    onSelect: fn(),
  },
})

export const NoOrganization = meta.story({
  render: () => (
    <McpOAuthOrganizationView
      {...organizationViewProps}
      organizations={noOrganizations}
      onSelect={fn()}
    />
  ),
})

export const OrganizationSelectionPending = meta.story({
  render: () => (
    <McpOAuthOrganizationView
      {...organizationViewProps}
      organizations={organizationOptions}
      onSelect={selectOrganizationPending}
      pendingOrganizationId="org_01K1BETALABS00000000000"
    />
  ),
})

export const ScopeConsent = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(
          fictionalDeviceAccounts.map((account) => ({
            session: account.session,
            user: {
              id: account.user.id,
              name: account.user.name,
              email: account.user.email,
              image: account.user.profileImage,
            },
          }))
        )
      )
    )
  },
  render: () => (
    <McpOAuthConsentView
      {...consentViewProps}
      organization={organizationOptions[0]}
      pending={false}
      scopes={consentScopes}
      onDecision={decide}
    />
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    await step("account切替dialogを開閉する", async () => {
      const trigger = canvas.getByRole("button", { name: "Switch account" })
      await userEvent.click(trigger)
      const accountSwitcher = await body.findByRole("dialog", {
        name: "Switch account",
      })
      await waitFor(() => expect(accountSwitcher).toBeVisible())
      await userEvent.click(body.getByRole("button", { name: "Close" }))
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})

export const ScopeConsentDenied = meta.story({
  render: () => (
    <McpOAuthConsentView
      {...consentViewProps}
      organization={organizationOptions[0]}
      pending={false}
      scopes={consentScopes}
      onDecision={decideDenied}
    />
  ),
})

export const ScopeConsentMobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <McpOAuthScopeConsentStoryFixture />,
})

export const ScopeConsentPending = meta.story({
  render: () => (
    <McpOAuthConsentView
      {...consentViewProps}
      organization={organizationOptions[0]}
      pending
      scopes={consentScopes}
      onDecision={decide}
    />
  ),
})

export const InvalidRequest = meta.story({
  render: () => (
    <McpOAuthConsentView
      {...consentViewProps}
      pending={false}
      scopes={null}
      onDecision={decide}
    />
  ),
})
