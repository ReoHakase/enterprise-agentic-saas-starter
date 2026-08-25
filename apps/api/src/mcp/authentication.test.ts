import type { McpOAuthAccessToken } from "@enterprise-agentic-saas/auth/mcp-oauth"
import { describe, expect, it, vi } from "vitest"

import { createAuthorizationService } from "../modules/authorization/service"
import {
  authenticateMcpRequest,
  type VerifyMcpOAuthAccessToken,
} from "./authentication"

const mcpOAuthResource = "https://api.example.test/mcp"

const credential = (
  overrides: Partial<McpOAuthAccessToken> = {}
): McpOAuthAccessToken => ({
  audience: mcpOAuthResource,
  clientId: "client_1",
  expiresAt: new Date(Date.now() + 60_000),
  issuedAt: new Date(),
  organizationId: "org_1",
  scopes: ["issues:read", "offline_access"],
  userId: "user_1",
  ...overrides,
})

const request = (authorization?: string) =>
  new Request("https://api.example.test/mcp", {
    headers: authorization ? { authorization } : undefined,
    method: "POST",
  })

const authorization = (
  membership = true,
  role: "owner" | "admin" | "member" = "admin"
) =>
  createAuthorizationService({
    findMembership: async () => (membership ? { id: "member_1", role } : null),
  })

describe("MCP OAuth authenticationの契約", () => {
  it("active credentialからorganization固定principalを作る", async () => {
    const principal = await authenticateMcpRequest({
      authorization: authorization(),
      request: request("Bearer mcp_at_secret"),
      resource: mcpOAuthResource,
      verifyAccessToken: async () => credential(),
    })

    expect(principal).toMatchObject({
      audience: mcpOAuthResource,
      clientId: "client_1",
      organizationId: "org_1",
      role: "admin",
      type: "oauth-user",
      userId: "user_1",
    })
    if (!principal) throw new Error("Expected an MCP principal")
    expect([...principal.scopes]).toEqual(["issues:read"])
  })

  it.each([
    { label: "owner権限", role: "owner" },
    { label: "admin権限", role: "admin" },
    { label: "member権限", role: "member" },
  ] as const)("$labelをMCP principalへ維持する", async ({ role }) => {
    const principal = await authenticateMcpRequest({
      authorization: authorization(true, role),
      request: request("Bearer mcp_at_secret"),
      resource: mcpOAuthResource,
      verifyAccessToken: async () => credential(),
    })

    expect(principal).toMatchObject({ role })
  })

  it.each([
    { header: undefined, label: "authorization header未設定" },
    {
      header: "Basic secret",
      label: "Basic schemeのauthorization header",
    },
    { header: "Bearer", label: "Bearer token未設定" },
    { header: "Bearer one two", label: "空白を含むBearer token" },
    {
      header: `Bearer ${"a".repeat(4097)}`,
      label: "上限を超えるBearer token",
    },
  ])("$labelを拒否する", async ({ header }) => {
    const verifyAccessToken = vi.fn<VerifyMcpOAuthAccessToken>()
    await expect(
      authenticateMcpRequest({
        authorization: authorization(),
        request: request(header),
        resource: mcpOAuthResource,
        verifyAccessToken,
      })
    ).resolves.toBeNull()
    expect(verifyAccessToken).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: "audienceが一致しないcredential",
      value: credential({ audience: "https://other.example.test/mcp" }),
    },
    {
      label: "期限切れcredential",
      value: credential({ expiresAt: new Date(0) }),
    },
    {
      label: "未来に発行されたcredential",
      value: credential({ issuedAt: new Date(Date.now() + 120_000) }),
    },
    {
      label: "未知scopeを持つcredential",
      value: credential({ scopes: ["unknown:read"] }),
    },
  ])("$labelを拒否する", async ({ value }) => {
    await expect(
      authenticateMcpRequest({
        authorization: authorization(),
        request: request("Bearer mcp_at_secret"),
        resource: mcpOAuthResource,
        verifyAccessToken: async () => value,
      })
    ).resolves.toBeNull()
  })

  it("organization membership削除後のcredentialを拒否する", async () => {
    await expect(
      authenticateMcpRequest({
        authorization: authorization(false),
        request: request("Bearer mcp_at_secret"),
        resource: mcpOAuthResource,
        verifyAccessToken: async () => credential(),
      })
    ).resolves.toBeNull()
  })
})
