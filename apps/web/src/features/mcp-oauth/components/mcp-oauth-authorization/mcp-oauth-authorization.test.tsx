import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  McpOAuthConsentView,
  McpOAuthOrganizationView,
} from "./mcp-oauth-authorization"

const organizations = [
  { active: true, id: "org_1", name: "Acme" },
  { active: false, id: "org_2", name: "Beta" },
] as const

const scopes = [{ description: "Read Issues", scope: "issues:read" }] as const

describe("MCP OAuth authorization views", () => {
  it("selects an organization by accessible name", async () => {
    const onSelect = vi.fn<(organizationId: string) => void>()
    render(
      <McpOAuthOrganizationView
        organizations={organizations}
        onSelect={onSelect}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /Beta/u }))
    expect(onSelect).toHaveBeenCalledWith("org_2")
  })

  it("shows public scope descriptions and accepts consent", async () => {
    const onDecision = vi.fn<(accept: boolean) => void>()
    render(
      <McpOAuthConsentView
        pending={false}
        scopes={scopes}
        onDecision={onDecision}
      />
    )

    expect(
      screen.getByRole("list", { name: "Requested access" })
    ).toHaveTextContent("Read Issues")
    await userEvent.click(screen.getByRole("button", { name: "Allow" }))
    expect(onDecision).toHaveBeenCalledWith(true)
  })

  it("fails closed when the requested scopes are invalid", () => {
    const onDecision = vi.fn<(accept: boolean) => void>()
    render(
      <McpOAuthConsentView
        pending={false}
        scopes={null}
        onDecision={onDecision}
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "authorization request is invalid"
    )
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull()
  })
})
