import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { McpOAuthGrantedScope } from "../../query"
import { McpOAuthScopeMatrix } from "./mcp-oauth-scope-matrix"

const requestedScopes = [
  { scope: "issues:read", description: "Read Issues" },
  { scope: "issues:create", description: "Create Issues" },
  { scope: "files:read", description: "Read Issue files" },
  { scope: "offline_access", description: "Keep access" },
] as const
const selectedInitial = ["issues:read", "files:read", "offline_access"] as const
const selectedAfterCell = [
  "offline_access",
  "issues:read",
  "issues:create",
  "files:read",
] as const
const selectedAfterRow = ["files:read", "offline_access"] as const
const selectedAfterColumn = [
  "offline_access",
  "issues:read",
  "files:read",
] as const
const selectedOfflineOnly = ["offline_access"] as const
const requestedFilesRead = [
  { scope: "files:read", description: "Read" },
] as const
const selectedFilesRead = ["files:read"] as const

describe("McpOAuthScopeMatrix", () => {
  it("supports cell, row, column, and offline access toggles", async () => {
    const onChange = vi.fn<(scopes: McpOAuthGrantedScope[]) => void>()
    const actor = userEvent.setup()
    const { rerender } = render(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedInitial}
      />
    )
    const grantedPermissions = within(
      screen.getByRole("region", { name: "Permissions to grant" })
    )
    expect(grantedPermissions.getByText("offline_access")).toBeVisible()
    expect(grantedPermissions.getByText("issues:read")).toBeVisible()
    expect(grantedPermissions.queryByText("issues:create")).toBeNull()

    await actor.click(
      screen.getByRole("checkbox", { name: "Issues Create access" })
    )
    expect(onChange).toHaveBeenLastCalledWith([
      "offline_access",
      "issues:read",
      "issues:create",
      "files:read",
    ])
    rerender(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedAfterCell}
      />
    )
    expect(grantedPermissions.getByText("issues:create")).toBeVisible()

    await actor.click(screen.getByRole("button", { name: "Issues" }))
    expect(onChange).toHaveBeenLastCalledWith(["offline_access", "files:read"])
    rerender(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedAfterRow}
      />
    )

    await actor.click(screen.getByRole("button", { name: "Read" }))
    expect(onChange).toHaveBeenLastCalledWith([
      "offline_access",
      "issues:read",
      "files:read",
    ])
    rerender(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedAfterColumn}
      />
    )

    await actor.click(screen.getByRole("button", { name: "Read" }))
    expect(onChange).toHaveBeenLastCalledWith(["offline_access"])
    rerender(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedOfflineOnly}
      />
    )

    await actor.click(
      screen.getByRole("checkbox", {
        name: /Keep access after the client is closed/u,
      })
    )
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it("renders unavailable operations as non-interactive cells", () => {
    render(
      <McpOAuthScopeMatrix
        readOnly
        requestedScopes={requestedFilesRead}
        selectedScopes={selectedFilesRead}
      />
    )

    expect(
      screen.getByRole("checkbox", { name: "Files Read access" })
    ).toHaveAttribute("aria-disabled", "true")
    expect(screen.getAllByText("—")).toHaveLength(24)
  })
})
