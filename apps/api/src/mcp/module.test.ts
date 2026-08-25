import type { McpOAuthAccessToken } from "@enterprise-agentic-saas/auth/mcp-oauth"
import { drizzle } from "drizzle-orm/libsql"
import { Elysia } from "elysia"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { createAuthorizationService } from "../modules/authorization/service"
import { createMcpModule } from "./module"

const mcpOAuthIssuer = "https://api.example.test/auth"
const mcpOAuthResource = "https://api.example.test/mcp"

const toolListResponseSchema = v.object({
  result: v.object({
    tools: v.array(v.object({ name: v.string() })),
  }),
})

const activeCredential: McpOAuthAccessToken = {
  audience: mcpOAuthResource,
  clientId: "client_1",
  expiresAt: new Date(Date.now() + 60_000),
  issuedAt: new Date(),
  organizationId: "org_1",
  scopes: ["issues:read"],
  userId: "user_1",
}

const createTestModule = (input?: {
  membership?: boolean
  verifyAccessToken?: () => Promise<McpOAuthAccessToken | null>
}) => {
  const authorization = createAuthorizationService({
    findMembership: async () =>
      input?.membership === false ? null : { id: "member_1", role: "member" },
  })

  return new Elysia().use(
    createMcpModule(
      drizzle({ connection: { url: ":memory:" } }),
      authorization,
      {
        getProtectedResourceMetadata: async () => ({
          authorization_servers: [mcpOAuthIssuer],
          bearer_methods_supported: ["header"],
          resource: mcpOAuthResource,
          scopes_supported: ["issues:read"],
        }),
        handleAuthorizationServerMetadata: async () =>
          Response.json({ issuer: mcpOAuthIssuer }),
        resource: mcpOAuthResource,
        verifyAccessToken:
          input?.verifyAccessToken ?? (async () => activeCredential),
      }
    )
  )
}

const mcpRequest = (
  authorization?: string,
  message: Record<string, unknown> = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "oauth-mcp-test", version: "1.0.0" },
    },
  }
) =>
  new Request("https://api.example.test/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "api.example.test",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(message),
  })

describe("OAuthで保護したMCP route", () => {
  it("protected resourceとauthorization serverのmetadataを返す", async () => {
    const app = createTestModule()
    const resource = await app.handle(
      new Request(
        "https://api.example.test/.well-known/oauth-protected-resource/mcp"
      )
    )
    expect(resource.status).toBe(200)
    await expect(resource.json()).resolves.toMatchObject({
      authorization_servers: [mcpOAuthIssuer],
      resource: mcpOAuthResource,
      scopes_supported: ["issues:read"],
    })

    const server = await app.handle(
      new Request(
        "https://api.example.test/.well-known/oauth-authorization-server/auth"
      )
    )
    await expect(server.json()).resolves.toEqual({ issuer: mcpOAuthIssuer })
  })

  it("未認証requestへ標準resource metadataでchallengeする", async () => {
    const response = await createTestModule().handle(mcpRequest())
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/mcp"'
    )
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
      message: "Authentication is required.",
    })
  })

  it("現在認可済みのmemberからinitializeを処理する", async () => {
    const response = await createTestModule().handle(
      mcpRequest("Bearer mcp_at_secret")
    )
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    const body: unknown = JSON.parse(text)
    expect(body).toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        serverInfo: {
          name: "Enterprise Agentic SaaS",
          version: "0.0.1",
        },
      },
    })
  })

  it("stateless transportで任意SSE subscriptionを拒否する", async () => {
    const response = await createTestModule().handle(
      new Request("https://api.example.test/mcp", {
        headers: { authorization: "Bearer mcp_at_secret" },
      })
    )

    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("POST")
  })

  it("現在のcredential scopeで許可したtoolだけを一覧する", async () => {
    const response = await createTestModule().handle(
      mcpRequest("Bearer mcp_at_secret", {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      })
    )
    expect(response.status).toBe(200)
    const body = v.parse(toolListResponseSchema, await response.json())
    expect(body.result.tools.map(({ name }) => name).toSorted()).toEqual(
      ["get_issue", "search_issue_labels", "search_issues"].toSorted()
    )
  })

  it.each([
    {
      label: "access tokenが失効している場合",
      membership: true,
      verifyAccessToken: async () => null,
    },
    {
      label: "membershipを失っている場合",
      membership: false,
      verifyAccessToken: async () => activeCredential,
    },
  ])("$labelを拒否する", async ({ label: _label, ...input }) => {
    const response = await createTestModule(input).handle(
      mcpRequest("Bearer mcp_at_secret")
    )
    expect(response.status).toBe(401)
  })
})
