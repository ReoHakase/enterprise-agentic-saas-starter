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

const authorization = (membership = true) =>
  createAuthorizationService({
    findMembership: async () =>
      membership ? { id: "member_1", role: "admin" } : null,
  })

describe("MCP OAuth authentication", () => {
  it("creates an organization-fixed principal from an active credential", async () => {
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
    undefined,
    "Basic secret",
    "Bearer",
    "Bearer one two",
    `Bearer ${"a".repeat(4097)}`,
  ])("rejects a missing or malformed credential", async (header) => {
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
    credential({ audience: "https://other.example.test/mcp" }),
    credential({ expiresAt: new Date(0) }),
    credential({ issuedAt: new Date(Date.now() + 120_000) }),
    credential({ scopes: ["unknown:read"] }),
  ])("rejects an invalid credential projection", async (value) => {
    await expect(
      authenticateMcpRequest({
        authorization: authorization(),
        request: request("Bearer mcp_at_secret"),
        resource: mcpOAuthResource,
        verifyAccessToken: async () => value,
      })
    ).resolves.toBeNull()
  })

  it("rejects a credential after organization membership is removed", async () => {
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
