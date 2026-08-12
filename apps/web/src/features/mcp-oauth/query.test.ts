import { MCP_PERMISSION_SCOPES } from "@enterprise-agentic-saas/auth/client"
import { describe, expect, it } from "vitest"

import {
  createMcpOAuthAddAccountHref,
  createMcpOAuthRoutePath,
  mcpOAuthScopeMatrixRows,
  parseMcpOAuthScopes,
  resolveMcpOAuthLoginRedirect,
} from "./query"

describe("MCP OAuth scope query", () => {
  it("projects allowlisted scopes into public descriptions", () => {
    expect(
      parseMcpOAuthScopes("issues:read files:write offline_access issues:read")
    ).toEqual([
      { description: "Read Issues", scope: "issues:read" },
      { description: "Upload and manage Issue files", scope: "files:write" },
      {
        description: "Keep access after the client is closed",
        scope: "offline_access",
      },
    ])
  })

  it("keeps the public scope labels aligned with the OAuth contract", () => {
    const summaries = parseMcpOAuthScopes(
      [...MCP_PERMISSION_SCOPES, "offline_access"].join(" ")
    )

    expect(summaries).toHaveLength(MCP_PERMISSION_SCOPES.length + 1)
    expect(summaries?.map(({ scope }) => scope)).toEqual([
      ...MCP_PERMISSION_SCOPES,
      "offline_access",
    ])
  })

  it("derives every matrix cell from the OAuth permission contract", () => {
    const matrixScopes = mcpOAuthScopeMatrixRows.flatMap(({ scopes }) =>
      Object.values(scopes)
    )

    expect(matrixScopes).toHaveLength(MCP_PERMISSION_SCOPES.length)
    expect(new Set(matrixScopes)).toEqual(new Set(MCP_PERMISSION_SCOPES))
  })

  it.each([undefined, [], ["issues:read"], "", "issues:read private:raw"])(
    "rejects missing, repeated-query, empty, and unknown input",
    (input) => {
      expect(parseMcpOAuthScopes(input)).toBeNull()
    }
  )
})

describe("MCP OAuth login redirect", () => {
  it("preserves the signed OAuth route when another account is added", () => {
    expect(
      createMcpOAuthAddAccountHref(
        "/oauth/organization?client_id=client_1&sig=signed-query"
      )
    ).toBe(
      "/auth/sign-in?redirectTo=%2Foauth%2Forganization%3Fclient_id%3Dclient_1%26sig%3Dsigned-query&add_account=1"
    )
  })

  it("preserves repeated query values for a local OAuth route", () => {
    expect(
      createMcpOAuthRoutePath("/oauth/organization", {
        ba_param: ["client_id", "state"],
        client_id: "client_1",
      })
    ).toBe(
      "/oauth/organization?ba_param=client_id&ba_param=state&client_id=client_1"
    )
  })

  it("preserves a signed authorization query on the local organization page", () => {
    const redirect = resolveMcpOAuthLoginRedirect({
      client_id: "client_1",
      exp: "1785726000",
      redirect_uri: "http://127.0.0.1/callback",
      response_type: "code",
      scope: "issues:read files:write",
      sig: "signed-query",
      state: "state_1",
    })

    expect(redirect).toBe(
      "/oauth/organization?client_id=client_1&exp=1785726000&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&response_type=code&scope=issues%3Aread+files%3Awrite&sig=signed-query&state=state_1"
    )
  })

  it.each([
    {},
    {
      client_id: "client_1",
      exp: "1785726000",
      redirect_uri: "http://127.0.0.1/callback",
      response_type: "token",
      sig: "signed-query",
    },
  ])("ignores a non-authorization query", (query) => {
    expect(resolveMcpOAuthLoginRedirect(query)).toBeNull()
  })
})
