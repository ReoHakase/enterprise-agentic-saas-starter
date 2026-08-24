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
const selectedOfflineOnly = ["offline_access"] as const
const requestedFilesRead = [
  { scope: "files:read", description: "Read" },
] as const
const selectedFilesRead = ["files:read"] as const

describe("McpOAuthScopeMatrixの契約", () => {
  it("固定matrixと現在のgrantを表示する", () => {
    render(
      <McpOAuthScopeMatrix
        onChange={vi.fn<(scopes: McpOAuthGrantedScope[]) => void>()}
        requestedScopes={requestedScopes}
        selectedScopes={selectedInitial}
      />
    )
    const table = screen.getByRole("table", { name: "Requested access" })
    const grantedPermissions = within(
      screen.getByRole("region", { name: "Permissions to grant" })
    )

    expect(within(table).getAllByRole("row")).toHaveLength(6)
    expect(within(table).getAllByRole("columnheader")).toHaveLength(6)
    expect(grantedPermissions.getByText("offline_access")).toBeVisible()
    expect(grantedPermissions.getByText("issues:read")).toBeVisible()
    expect(grantedPermissions.queryByText("issues:create")).toBeNull()
  })

  it("個別scopeを切り替える", async () => {
    const onChange = vi.fn<(scopes: McpOAuthGrantedScope[]) => void>()
    const actor = userEvent.setup()
    render(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedInitial}
      />
    )

    await actor.click(
      screen.getByRole("checkbox", { name: "Issues Create access" })
    )
    expect(onChange).toHaveBeenLastCalledWith([
      "offline_access",
      "issues:read",
      "issues:create",
      "files:read",
    ])
  })

  it("不定状態の行にある要求scopeをすべて選択する", async () => {
    const onChange = vi.fn<(scopes: McpOAuthGrantedScope[]) => void>()
    const actor = userEvent.setup()
    render(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedInitial}
      />
    )
    const issuesToggle = screen.getByRole("checkbox", {
      name: "Toggle all Issues access",
    })

    expect(issuesToggle).toHaveAttribute("aria-checked", "mixed")
    await actor.click(issuesToggle)
    expect(onChange).toHaveBeenCalledWith([...selectedAfterCell])
  })

  it("操作列にある要求scopeをすべて消去する", async () => {
    const onChange = vi.fn<(scopes: McpOAuthGrantedScope[]) => void>()
    const actor = userEvent.setup()
    render(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedInitial}
      />
    )

    await actor.click(screen.getByRole("button", { name: "Read" }))
    expect(onChange).toHaveBeenCalledWith([...selectedOfflineOnly])
  })

  it("offline accessを権限scopeとは別に切り替える", async () => {
    const onChange = vi.fn<(scopes: McpOAuthGrantedScope[]) => void>()
    const actor = userEvent.setup()
    render(
      <McpOAuthScopeMatrix
        onChange={onChange}
        requestedScopes={requestedScopes}
        selectedScopes={selectedInitial}
      />
    )

    await actor.click(
      screen.getByRole("checkbox", {
        name: /Keep access after the client is closed/u,
      })
    )
    expect(onChange).toHaveBeenCalledWith(["issues:read", "files:read"])
  })

  it("利用不能な操作を非対話型cellとして描画する", () => {
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
    expect(screen.getByRole("button", { name: "Files" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Read" })).toBeDisabled()
  })
})
