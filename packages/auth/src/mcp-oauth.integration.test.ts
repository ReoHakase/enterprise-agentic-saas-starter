import { migrate } from "drizzle-orm/libsql/migrator"
import { beforeAll, describe, expect, it } from "vitest"

import type {
  auth as Auth,
  hashMcpOAuthToken as HashMcpOAuthToken,
  mcpOAuthResource as McpOAuthResource,
  verifyMcpOAuthAccessToken as VerifyMcpOAuthAccessToken,
} from "./index"

let auth: typeof Auth
let hashMcpOAuthToken: typeof HashMcpOAuthToken
let mcpOAuthResource: typeof McpOAuthResource
let verifyMcpOAuthAccessToken: typeof VerifyMcpOAuthAccessToken

beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    BETTER_AUTH_URL: "http://api.localhost",
    AUTH_COOKIE_DOMAIN: "localhost",
    GITHUB_CLIENT_ID: "test-github-client",
    GITHUB_CLIENT_SECRET: "test-github-secret",
    TRUSTED_ORIGINS: "http://app.localhost",
    TURSO_DATABASE_URL: "file::memory:",
    EMAIL_PROVIDER: "noop",
    EMAIL_FROM: "noreply@example.com",
  })
  const authModule = await import("./index")
  auth = authModule.auth
  hashMcpOAuthToken = authModule.hashMcpOAuthToken
  mcpOAuthResource = authModule.mcpOAuthResource
  verifyMcpOAuthAccessToken = authModule.verifyMcpOAuthAccessToken

  const { db } = await import("@enterprise-agentic-saas/db")
  await migrate(db, {
    migrationsFolder: new URL("../../db/drizzle", import.meta.url).pathname,
  })
}, 30_000)

describe("MCP OAuth opaque credentials", () => {
  it("verifies and immediately revokes an organization credential", async () => {
    const [{ db }, schema] = await Promise.all([
      import("@enterprise-agentic-saas/db"),
      import("@enterprise-agentic-saas/db/schema"),
    ])
    const suffix = crypto.randomUUID()
    const userId = `mcp-user-${suffix}`
    const clientId = `mcp-client-${suffix}`
    const accessToken = `opaque-${suffix}`
    const now = new Date()

    await db.insert(schema.user).values({
      id: userId,
      name: "MCP User",
      email: `mcp-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.oauthClient).values({
      id: `oauth-client-row-${suffix}`,
      clientId,
      name: "MCP Test Client",
      public: true,
      redirectUris: ["http://127.0.0.1/callback"],
      requirePKCE: true,
      scopes: ["issues:read"],
      tokenEndpointAuthMethod: "none",
      userId,
    })
    await db.insert(schema.oauthAccessToken).values({
      id: `oauth-access-row-${suffix}`,
      token: await hashMcpOAuthToken(accessToken),
      clientId,
      userId,
      referenceId: `organization-${suffix}`,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      scopes: ["issues:read"],
    })

    await expect(
      verifyMcpOAuthAccessToken(`mcp_at_${accessToken}`)
    ).resolves.toMatchObject({
      audience: mcpOAuthResource,
      clientId,
      organizationId: `organization-${suffix}`,
      scopes: ["issues:read"],
      userId,
    })

    const revoke = await auth.handler(
      new Request("http://api.localhost/auth/oauth2/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          token: `mcp_at_${accessToken}`,
          token_type_hint: "access_token",
        }),
      })
    )
    expect(revoke.status).toBe(200)
    await expect(
      verifyMcpOAuthAccessToken(`mcp_at_${accessToken}`)
    ).resolves.toBeNull()
  })
})
