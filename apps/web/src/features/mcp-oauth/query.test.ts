import { MCP_PERMISSION_SCOPES } from "@enterprise-agentic-saas/auth/client"
import { describe, expect, it } from "vitest"

import {
  createMcpOAuthAddAccountHref,
  mcpOAuthScopeMatrixRows,
  parseMcpOAuthSearchParams,
  parseMcpOAuthScopes,
  resolveMcpOAuthLoginRedirect,
} from "./query"

describe("MCP OAuth scope queryの契約", () => {
  it("allowlist済みscopeを公開説明へprojectionする", () => {
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

  it("公開scopeのlabelをOAuth契約と一致させる", () => {
    const summaries = parseMcpOAuthScopes(
      [...MCP_PERMISSION_SCOPES, "offline_access"].join(" ")
    )

    expect(summaries).toHaveLength(MCP_PERMISSION_SCOPES.length + 1)
    expect(summaries?.map(({ scope }) => scope)).toEqual([
      ...MCP_PERMISSION_SCOPES,
      "offline_access",
    ])
  })

  it("OAuth権限契約からmatrixの全cellを導出する", () => {
    const matrixScopes = mcpOAuthScopeMatrixRows.flatMap(({ scopes }) =>
      Object.values(scopes)
    )

    expect(matrixScopes).toHaveLength(MCP_PERMISSION_SCOPES.length)
    expect(new Set(matrixScopes)).toEqual(new Set(MCP_PERMISSION_SCOPES))
  })

  it.each([
    { case: "値の欠落", input: undefined },
    { case: "空の配列", input: [] },
    { case: "配列形式", input: ["issues:read"] },
    { case: "空文字列", input: "" },
    { case: "未知のscope", input: "issues:read private:raw" },
  ])("$caseのscope入力を拒否する", ({ input }) => {
    expect(parseMcpOAuthScopes(input)).toBeNull()
  })
})

describe("MCP OAuth ログインリダイレクト", () => {
  it("raw queryの数値様文字列と重複値をそのまま保持する", () => {
    const rawSearch =
      "?response_type=code&client_id=client_1&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&exp=0001785726000&sig=signed-query&ba_param=client_id&ba_param=state"
    const query = parseMcpOAuthSearchParams(rawSearch)

    expect(query).toEqual({
      ba_param: ["client_id", "state"],
      client_id: "client_1",
      exp: "0001785726000",
      redirect_uri: "http://127.0.0.1/callback",
      response_type: "code",
      sig: "signed-query",
    })
    expect(resolveMcpOAuthLoginRedirect(query, rawSearch)).toBe(
      `/oauth/organization${rawSearch}`
    )
  })

  it("別アカウント追加時も署名済みOAuthルートを保持する", () => {
    expect(
      createMcpOAuthAddAccountHref(
        "/oauth/organization?client_id=client_1&sig=signed-query"
      )
    ).toBe(
      "/auth/sign-in?redirectTo=%2Foauth%2Forganization%3Fclient_id%3Dclient_1%26sig%3Dsigned-query&add_account=1"
    )
  })

  it("ローカルOAuthルートの重複query値を保持する", () => {
    expect(
      resolveMcpOAuthLoginRedirect({
        ba_param: ["client_id", "state"],
        client_id: "client_1",
        exp: "1785726000",
        redirect_uri: "http://127.0.0.1/callback",
        response_type: "code",
        sig: "signed-query",
      })
    ).toBe(
      "/oauth/organization?ba_param=client_id&ba_param=state&client_id=client_1&exp=1785726000&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&response_type=code&sig=signed-query"
    )
  })

  it("署名済み認可queryをローカル組織ページで保持する", () => {
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
    { case: "queryの欠落", query: {} },
    {
      case: "response_typeの不一致",
      query: {
        client_id: "client_1",
        exp: "1785726000",
        redirect_uri: "http://127.0.0.1/callback",
        response_type: "token",
        sig: "signed-query",
      },
    },
  ])("$caseでは認可用でないqueryを無視する", ({ query }) => {
    expect(resolveMcpOAuthLoginRedirect(query)).toBeNull()
  })
})
