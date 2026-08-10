import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  McpOAuthConsentView,
  McpOAuthOrganizationView,
} from "./mcp-oauth-authorization"

const selectOrganization = fn()
const selectOrganizationPending = fn()
const decide = fn()
const decideDenied = fn()
const consentScopes = [
  { description: "Read Issues", scope: "issues:read" },
  { description: "Create Issues", scope: "issues:create" },
] as const
const organizationOptions = [
  { active: true, id: "org_acme", name: "Acme" },
  { active: false, id: "org_beta", name: "Beta" },
] as const
const noOrganizations = [] as const

const meta = preview.meta({
  title: "Web/MCP OAuth/Authorization",
  component: McpOAuthOrganizationView,
  tags: ["autodocs"],
})

export const OrganizationSelection = meta.story({
  tags: ["theme-sensitive"],
  args: {
    organizations: organizationOptions,
    onSelect: selectOrganization,
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /Beta/u })
    await userEvent.click(button)
    await expect(selectOrganization).toHaveBeenCalledWith("org_beta")
  },
})

export const NoOrganization = meta.story({
  render: () => (
    <McpOAuthOrganizationView
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
      organizations={organizationOptions}
      onSelect={selectOrganizationPending}
      pendingOrganizationId="org_beta"
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Beta/u })).toBeDisabled()
    await expect(
      canvas.getByRole("status", { name: "Selecting organization" })
    ).toBeVisible()
  },
})

export const ScopeConsent = meta.story({
  render: () => (
    <McpOAuthConsentView
      pending={false}
      scopes={consentScopes}
      onDecision={decide}
    />
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Allow" }))
    await expect(decide).toHaveBeenCalledWith(true)
  },
})

export const ScopeConsentDenied = meta.story({
  render: () => (
    <McpOAuthConsentView
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

export const ScopeConsentPending = meta.story({
  render: () => (
    <McpOAuthConsentView pending scopes={consentScopes} onDecision={decide} />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Deny" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: /Allow/u })).toBeDisabled()
  },
})

export const InvalidRequest = meta.story({
  render: () => (
    <McpOAuthConsentView pending={false} scopes={null} onDecision={decide} />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "authorization request is invalid"
    )
    await expect(canvas.queryByRole("button", { name: "Allow" })).toBeNull()
  },
})
