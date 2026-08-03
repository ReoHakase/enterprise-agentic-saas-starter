import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  McpOAuthConsentView,
  McpOAuthOrganizationView,
} from "./mcp-oauth-authorization"

const selectOrganization = fn()
const decide = fn()
const consentScopes = [
  { description: "Read Issues", scope: "issues:read" },
  { description: "Create Issues", scope: "issues:create" },
] as const

const meta = preview.meta({
  title: "Web/MCP OAuth/Authorization",
  component: McpOAuthOrganizationView,
  tags: ["autodocs"],
})

export const OrganizationSelection = meta.story({
  tags: ["theme-sensitive"],
  args: {
    organizations: [
      { active: true, id: "org_acme", name: "Acme" },
      { active: false, id: "org_beta", name: "Beta" },
    ],
    onSelect: selectOrganization,
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /Beta/u })
    await userEvent.click(button)
    await expect(selectOrganization).toHaveBeenCalledWith("org_beta")
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
