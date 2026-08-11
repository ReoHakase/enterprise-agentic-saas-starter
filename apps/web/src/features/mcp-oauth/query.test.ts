import { MCP_PERMISSION_SCOPES } from "@enterprise-agentic-saas/auth/client"
import { describe, expect, it } from "vitest"

import { parseMcpOAuthScopes, resolveMcpOAuthLoginRedirect } from "./query"

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

  it.each([undefined, [], ["issues:read"], "", "issues:read private:raw"])(
    "rejects missing, repeated-query, empty, and unknown input",
    (input) => {
      expect(parseMcpOAuthScopes(input)).toBeNull()
    }
  )
})

describe("MCP OAuth login redirect", () => {
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
