import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fictionalOrganizations } from "../../../organizations/test-support/fixtures"
import {
  McpOAuthConsentView,
  McpOAuthOrganizationView,
} from "./mcp-oauth-authorization"

const organizations = fictionalOrganizations
const currentUser = {
  id: "user-current",
  name: "Current User",
  email: "current@example.test",
  profileImage: null,
}
const consentViewProps = {
  addAccountHref: "/auth/sign-in?add_account=1&redirectTo=%2Foauth%2Fconsent",
  currentUser,
  returnTo: "/oauth/consent",
} as const

const scopes = [{ description: "Read Issues", scope: "issues:read" }] as const
const selectableScopes = [
  { description: "Read Issues", scope: "issues:read" },
  { description: "Create Issues", scope: "issues:create" },
] as const
const offlineOnlyScopes = [
  { description: "Keep access", scope: "offline_access" },
] as const

describe("MCP OAuth authorization views", () => {
  it("selects an organization by accessible name", async () => {
    const onSelect = vi.fn<(organizationId: string) => void>()
    render(
      <McpOAuthOrganizationView
        addAccountHref="/auth/sign-in?add_account=1&redirectTo=%2Foauth%2Forganization"
        currentUser={currentUser}
        organizations={organizations}
        returnTo="/oauth/organization"
        onSelect={onSelect}
      />
    )

    expect(
      screen.getByRole("table", {
        name: "Organizations available for this MCP credential",
      })
    ).toHaveTextContent("Organization")
    expect(screen.getByLabelText("3 organization members")).toBeVisible()
    expect(screen.getByText("current@example.test")).toBeVisible()
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Beta Labs" })
    )
    expect(onSelect).toHaveBeenCalledWith("org_01K1BETALABS00000000000")
    expect(screen.getByText("Owner")).toBeVisible()
    expect(screen.getByText("Admin")).toBeVisible()
  })

  it("shows public scope descriptions and accepts consent", async () => {
    const onDecision =
      vi.fn<(accept: boolean, grantedScopes?: readonly string[]) => void>()
    render(
      <McpOAuthConsentView
        {...consentViewProps}
        pending={false}
        scopes={scopes}
        onDecision={onDecision}
      />
    )

    expect(
      screen.getByRole("table", { name: "Requested access" })
    ).toHaveTextContent("Issues")
    expect(
      screen.getByRole("region", { name: "Current account" })
    ).toHaveTextContent("current@example.test")
    expect(screen.getByRole("button", { name: "Switch account" })).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Allow" }))
    expect(onDecision).toHaveBeenCalledWith(true, ["issues:read"])
  })

  it("keeps cell selections after the consent view rerenders", async () => {
    render(
      <McpOAuthConsentView
        {...consentViewProps}
        pending={false}
        scopes={selectableScopes}
        onDecision={vi.fn<(accept: boolean) => void>()}
      />
    )

    const checkbox = screen.getByRole("checkbox", {
      name: "Issues Create access",
    })
    expect(checkbox).toBeChecked()
    await userEvent.click(checkbox)
    expect(
      screen.getByRole("checkbox", { name: "Issues Create access" })
    ).not.toBeChecked()
  })

  it("does not allow an offline-only grant", () => {
    render(
      <McpOAuthConsentView
        {...consentViewProps}
        pending={false}
        scopes={offlineOnlyScopes}
        onDecision={vi.fn<(accept: boolean) => void>()}
      />
    )

    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select at least one permission"
    )
  })

  it("fails closed when the requested scopes are invalid", () => {
    const onDecision = vi.fn<(accept: boolean) => void>()
    render(
      <McpOAuthConsentView
        {...consentViewProps}
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
