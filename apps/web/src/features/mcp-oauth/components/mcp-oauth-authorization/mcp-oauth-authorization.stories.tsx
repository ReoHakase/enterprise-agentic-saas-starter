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

const selectOrganization = fn()
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
    onSelect: selectOrganization,
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", {
      name: "Continue with Beta Labs",
    })
    await userEvent.click(button)
    await expect(selectOrganization).toHaveBeenCalledWith(
      "org_01K1BETALABS00000000000"
    )
  },
})

export const NoOrganization = meta.story({
  render: () => (
    <McpOAuthOrganizationView
      {...organizationViewProps}
      organizations={noOrganizations}
      onSelect={selectOrganization}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "No organization is available"
    )
  },
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
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Continue with Beta Labs" })
    ).toBeDisabled()
    await expect(
      canvas.getByRole("status", { name: "Selecting organization" })
    ).toBeVisible()
  },
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
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch account" })
    )
    const body = within(canvasElement.ownerDocument.body)
    const accountSwitcher = await body.findByRole("dialog", {
      name: "Switch account",
    })
    await waitFor(() => expect(accountSwitcher).toBeVisible())
    await userEvent.click(body.getByRole("button", { name: "Close" }))
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Issues Delete access" })
    )
    await expect(
      canvas.getByRole("checkbox", { name: "Issues Delete access" })
    ).not.toBeChecked()
    await expect(
      canvas.getByRole("checkbox", { name: "Toggle all Issues access" })
    ).toHaveAttribute("aria-checked", "mixed")
    await userEvent.click(canvas.getByRole("button", { name: "Allow" }))
    await expect(decide).toHaveBeenCalledWith(true, [
      "offline_access",
      "account:read",
      "organization:read",
      "members:read",
      "issues:read",
      "issues:create",
      "issues:update",
      "files:read",
      "files:write",
    ])
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
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Deny" }))
    await expect(decideDenied).toHaveBeenCalledWith(false)
  },
})

export const ScopeConsentMobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <McpOAuthConsentView
      {...consentViewProps}
      organization={organizationOptions[0]}
      pending={false}
      scopes={consentScopes}
      onDecision={decide}
    />
  ),
  play: async ({ canvas, canvasElement }) => {
    const scrollRegion = await canvas.findByRole("region", {
      name: "Requested access",
    })
    await expect(scrollRegion).toHaveAttribute(
      "data-horizontal-overflow",
      "true"
    )
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
    await expect(
      canvas.getByRole("region", { name: "Permissions to grant" })
    ).toBeVisible()
  },
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
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Deny" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: /Allow/u })).toBeDisabled()
  },
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
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "authorization request is invalid"
    )
    await expect(canvas.queryByRole("button", { name: "Allow" })).toBeNull()
  },
})
