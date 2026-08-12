import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { fictionalOrganizations } from "../../../organizations/test-support/fixtures"
import { McpOAuthSessionsPanel } from "./mcp-oauth-sessions-panel"

const credential = {
  clientName: "Codex local",
  createdAt: "2026-08-12T00:00:00.000Z",
  credentialId: "r_storybook-refresh",
  expiresAt: "2026-09-12T00:00:00.000Z",
  organization: fictionalOrganizations[0],
  refreshable: true,
  scopes: ["offline_access", "issues:read", "issues:update", "files:write"],
}

const meta = preview.meta({
  title: "Web/Account/MCP OAuth Sessions Panel",
  component: McpOAuthSessionsPanel,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <div className="mx-auto max-w-5xl">
          <Story />
        </div>
      </Providers>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.get("*/me/mcp-oauth/sessions", () =>
        HttpResponse.json([credential])
      ),
      http.delete("*/me/mcp-oauth/sessions/*", () =>
        HttpResponse.json({ id: credential.credentialId })
      )
    )
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await canvas.findByText("Codex local")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Revoke" }))
    await expect(
      body.getByRole("alertdialog", { name: "Revoke MCP access?" })
    ).toBeInTheDocument()
    await userEvent.click(body.getByRole("button", { name: "Cancel" }))
    await waitFor(() =>
      expect(
        body.queryByRole("alertdialog", { name: "Revoke MCP access?" })
      ).not.toBeInTheDocument()
    )
  },
})

export const Empty = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("*/me/mcp-oauth/sessions", () => HttpResponse.json([])))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No MCP access grants")).toBeVisible()
  },
})

export const RetrySuccess = meta.story({
  beforeEach({ msw }) {
    let attempt = 0
    msw.use(
      http.get("*/me/mcp-oauth/sessions", () => {
        attempt += 1
        return attempt === 1
          ? HttpResponse.json(
              { error: "validation_error", message: "Temporary failure." },
              { status: 400 }
            )
          : HttpResponse.json([credential])
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("MCP access could not be loaded")
    ).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(await canvas.findByText("Codex local")).toBeVisible()
  },
})
