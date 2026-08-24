import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { and, eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type {
  auth as Auth,
  hashMcpOAuthToken as HashMcpOAuthToken,
  mcpOAuthResource as McpOAuthResource,
  verifyMcpOAuthAccessToken as VerifyMcpOAuthAccessToken,
} from "./index"
import type {
  listMcpOAuthCredentialFamilies as ListMcpOAuthCredentialFamilies,
  revokeMcpOAuthCredentialFamily as RevokeMcpOAuthCredentialFamily,
} from "./server/mcp-oauth-credentials"

let auth: typeof Auth
let hashMcpOAuthToken: typeof HashMcpOAuthToken
let listMcpOAuthCredentialFamilies: typeof ListMcpOAuthCredentialFamilies
let mcpOAuthResource: typeof McpOAuthResource
let revokeMcpOAuthCredentialFamily: typeof RevokeMcpOAuthCredentialFamily
let verifyMcpOAuthAccessToken: typeof VerifyMcpOAuthAccessToken
let databaseDirectory: string

beforeAll(async () => {
  databaseDirectory = await mkdtemp(join(tmpdir(), "mcp-oauth-auth-test-"))
  Object.assign(process.env, {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    BETTER_AUTH_URL: "http://api.localhost",
    AUTH_COOKIE_DOMAIN: "localhost",
    GITHUB_CLIENT_ID: "test-github-client",
    GITHUB_CLIENT_SECRET: "test-github-secret",
    TRUSTED_ORIGINS: "http://app.localhost",
    TURSO_DATABASE_URL: `file:${join(databaseDirectory, "auth.db")}`,
    EMAIL_PROVIDER: "noop",
    EMAIL_FROM: "noreply@example.com",
  })
  const { db } = await import("@enterprise-agentic-saas/db")
  await migrate(db, {
    migrationsFolder: new URL("../../db/drizzle-v3", import.meta.url).pathname,
  })

  const [authModule, credentialModule] = await Promise.all([
    import("./index"),
    import("./server/mcp-oauth-credentials"),
  ])
  auth = authModule.auth
  hashMcpOAuthToken = authModule.hashMcpOAuthToken
  listMcpOAuthCredentialFamilies =
    credentialModule.listMcpOAuthCredentialFamilies
  mcpOAuthResource = authModule.mcpOAuthResource
  revokeMcpOAuthCredentialFamily =
    credentialModule.revokeMcpOAuthCredentialFamily
  verifyMcpOAuthAccessToken = authModule.verifyMcpOAuthAccessToken
}, 30_000)

afterAll(async () => {
  await rm(databaseDirectory, { force: true, recursive: true })
})

describe("MCP OAuthのopaque認証情報", () => {
  it("form POST認可では設定済みresourceだけを受理する", async () => {
    const authorize = (...resources: string[]) => {
      const body = new URLSearchParams({
        client_id: "missing-client",
        response_type: "code",
      })
      for (const resource of resources) body.append("resource", resource)
      return auth.handler(
        new Request("http://api.localhost/auth/oauth2/authorize", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        })
      )
    }

    const valid = await authorize(mcpOAuthResource)
    expect(valid.status).toBe(302)
    expect(valid.headers.get("location")).toContain("error=invalid_client")

    const missing = await authorize()
    expect(missing.status).toBe(400)
    await expect(missing.json()).resolves.toMatchObject({
      code: "MCP_RESOURCE_REQUIRED",
    })

    const mixed = await authorize(
      mcpOAuthResource,
      "https://other.example.test/mcp"
    )
    expect(mixed.status).toBe(400)
    await expect(mixed.json()).resolves.toMatchObject({
      code: "MCP_RESOURCE_REQUIRED",
    })
  })

  it("動的登録クライアントを設定済みresource方針の先へ進める", async () => {
    const redirectUri = "http://127.0.0.1/callback"
    const registrationResponse = await auth.handler(
      new Request("http://api.localhost/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          application_type: "native",
          client_name: "MCP Resource Policy Client",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: [redirectUri],
          response_types: ["code"],
          scope: "issues:read offline_access",
          token_endpoint_auth_method: "none",
        }),
      })
    )
    const registration: unknown = await registrationResponse.json()
    if (
      typeof registration !== "object" ||
      registration === null ||
      !("client_id" in registration) ||
      typeof registration.client_id !== "string"
    ) {
      throw new Error("Expected dynamic registration to return a client ID")
    }
    const authorizeUrl = new URL("http://api.localhost/auth/oauth2/authorize")
    authorizeUrl.search = new URLSearchParams({
      client_id: registration.client_id,
      code_challenge: "A".repeat(43),
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      resource: mcpOAuthResource,
      response_type: "code",
      scope: "issues:read",
      state: "resource-policy-state",
    }).toString()

    const authorizeResponse = await auth.handler(new Request(authorizeUrl))
    const location = authorizeResponse.headers.get("location")
    const oauthProviderPlugin = auth.options.plugins?.find(
      ({ id }) => id === "oauth-provider"
    )

    expect(registrationResponse.status).toBe(201)
    expect(authorizeResponse.status).toBe(302)
    expect(location).not.toContain("error=invalid_target")
    expect(new URL(location ?? "http://invalid.local")).toMatchObject({
      origin: "http://app.localhost",
      pathname: "/oauth/organization",
    })
    expect(oauthProviderPlugin?.options).toMatchObject({
      enforcePerClientResources: false,
      resources: [mcpOAuthResource],
    })
    expect(oauthProviderPlugin?.options).not.toHaveProperty("validAudiences")
  })

  it("organization認証情報を検証して即時失効する", async () => {
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

  it("Better Authでsoft revokeされたaccess tokenを検証と一覧から除外する", async () => {
    const [{ db }, schema] = await Promise.all([
      import("@enterprise-agentic-saas/db"),
      import("@enterprise-agentic-saas/db/schema"),
    ])
    const suffix = crypto.randomUUID()
    const userId = `mcp-revoked-user-${suffix}`
    const clientId = `mcp-revoked-client-${suffix}`
    const accessToken = `revoked-${suffix}`
    const now = new Date()

    await db.insert(schema.user).values({
      id: userId,
      name: "Revoked MCP User",
      email: `mcp-revoked-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.oauthClient).values({
      id: `oauth-revoked-client-row-${suffix}`,
      clientId,
      name: "Revoked MCP Client",
      public: true,
      redirectUris: ["http://127.0.0.1/callback"],
      requirePKCE: true,
      scopes: ["issues:read"],
      tokenEndpointAuthMethod: "none",
      userId,
    })
    await db.insert(schema.oauthAccessToken).values({
      id: `oauth-revoked-access-row-${suffix}`,
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
    ).resolves.toMatchObject({ clientId, userId })
    await expect(listMcpOAuthCredentialFamilies(db, userId)).resolves.toEqual([
      expect.objectContaining({
        credentialId: `a_oauth-revoked-access-row-${suffix}`,
      }),
    ])

    await db
      .update(schema.oauthAccessToken)
      .set({ revoked: now })
      .where(
        eq(schema.oauthAccessToken.token, await hashMcpOAuthToken(accessToken))
      )

    await expect(
      verifyMcpOAuthAccessToken(`mcp_at_${accessToken}`)
    ).resolves.toBeNull()
    await expect(listMcpOAuthCredentialFamilies(db, userId)).resolves.toEqual(
      []
    )
  })

  it("機密情報を含まない認証情報familyを一覧しtoken行を失効する", async () => {
    const [{ db }, schema] = await Promise.all([
      import("@enterprise-agentic-saas/db"),
      import("@enterprise-agentic-saas/db/schema"),
    ])
    const suffix = crypto.randomUUID()
    const userId = `mcp-family-user-${suffix}`
    const clientId = `mcp-family-client-${suffix}`
    const refreshId = `mcp-family-refresh-${suffix}`
    const accessId = `mcp-family-access-${suffix}`
    const now = new Date()

    await db.insert(schema.user).values({
      id: userId,
      name: "MCP Family User",
      email: `mcp-family-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.oauthClient).values({
      id: `oauth-family-client-row-${suffix}`,
      clientId,
      name: "Family Test Client",
      public: true,
      redirectUris: ["http://127.0.0.1/callback"],
      requirePKCE: true,
      scopes: ["offline_access", "issues:read", "files:write"],
      tokenEndpointAuthMethod: "none",
      userId,
    })
    await db.insert(schema.oauthRefreshToken).values({
      id: refreshId,
      token: `refresh-token-${suffix}`,
      clientId,
      userId,
      referenceId: `organization-${suffix}`,
      createdAt: new Date(now.getTime() - 1_000),
      expiresAt: new Date(now.getTime() + 60_000),
      scopes: ["offline_access", "issues:read", "files:write"],
    })
    await db.insert(schema.oauthAccessToken).values({
      id: accessId,
      token: `access-token-${suffix}`,
      clientId,
      userId,
      referenceId: `organization-${suffix}`,
      refreshId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      scopes: ["offline_access", "issues:read", "files:write"],
    })

    const families = await listMcpOAuthCredentialFamilies(db, userId)
    expect(families).toEqual([
      {
        clientName: "Family Test Client",
        createdAt: new Date(now.getTime() - 1_000),
        credentialId: `r_${refreshId}`,
        expiresAt: new Date(now.getTime() + 60_000),
        organizationId: `organization-${suffix}`,
        refreshable: true,
        scopes: ["offline_access", "issues:read", "files:write"],
      },
    ])
    expect(JSON.stringify(families)).not.toContain("access-token-")
    expect(JSON.stringify(families)).not.toContain("refresh-token-")

    await expect(
      revokeMcpOAuthCredentialFamily({
        database: db,
        credentialId: `r_${refreshId}`,
        userId: `other-${userId}`,
      })
    ).resolves.toBe(false)

    await expect(
      revokeMcpOAuthCredentialFamily({
        database: db,
        credentialId: `r_${refreshId}`,
        userId,
      })
    ).resolves.toBe(true)

    await expect(
      db
        .select({ revoked: schema.oauthRefreshToken.revoked })
        .from(schema.oauthRefreshToken)
        .where(eq(schema.oauthRefreshToken.id, refreshId))
    ).resolves.toEqual([{ revoked: expect.any(Date) }])
    await expect(
      db
        .select({ id: schema.oauthAccessToken.id })
        .from(schema.oauthAccessToken)
        .where(eq(schema.oauthAccessToken.id, accessId))
    ).resolves.toEqual([])
    await expect(
      revokeMcpOAuthCredentialFamily({
        database: db,
        credentialId: `r_${refreshId}`,
        userId,
      })
    ).resolves.toBe(false)
  })

  it("refresh tokenのrotationをclientとorganization単位でまとめて失効する", async () => {
    const [{ db }, schema] = await Promise.all([
      import("@enterprise-agentic-saas/db"),
      import("@enterprise-agentic-saas/db/schema"),
    ])
    const suffix = crypto.randomUUID()
    const userId = `mcp-rotation-user-${suffix}`
    const clientId = `mcp-rotation-client-${suffix}`
    const organizationId = `organization-${suffix}`
    const otherOrganizationId = `organization-other-${suffix}`
    const firstRefreshId = `refresh-first-${suffix}`
    const activeRefreshId = `refresh-active-${suffix}`
    const otherRefreshId = `refresh-other-${suffix}`
    const firstAccessToken = `first-${suffix}`
    const activeAccessToken = `active-${suffix}`
    const otherAccessToken = `other-${suffix}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 60_000)

    await db.insert(schema.user).values({
      id: userId,
      name: "MCP Rotation User",
      email: `mcp-rotation-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.oauthClient).values({
      id: `oauth-rotation-client-row-${suffix}`,
      clientId,
      name: "Rotation Test Client",
      public: true,
      redirectUris: ["http://127.0.0.1/callback"],
      requirePKCE: true,
      scopes: ["offline_access", "issues:read"],
      tokenEndpointAuthMethod: "none",
      userId,
    })
    await db.insert(schema.oauthRefreshToken).values([
      {
        id: firstRefreshId,
        token: `refresh-first-token-${suffix}`,
        clientId,
        userId,
        referenceId: organizationId,
        createdAt: new Date(now.getTime() - 2_000),
        expiresAt,
        revoked: new Date(now.getTime() - 1_000),
        scopes: ["offline_access", "issues:read"],
      },
      {
        id: activeRefreshId,
        token: `refresh-active-token-${suffix}`,
        clientId,
        userId,
        referenceId: organizationId,
        createdAt: new Date(now.getTime() - 1_000),
        expiresAt,
        scopes: ["offline_access", "issues:read"],
      },
      {
        id: otherRefreshId,
        token: `refresh-other-token-${suffix}`,
        clientId,
        userId,
        referenceId: otherOrganizationId,
        createdAt: now,
        expiresAt,
        scopes: ["offline_access", "issues:read"],
      },
    ])
    await db.insert(schema.oauthAccessToken).values([
      {
        id: `access-first-${suffix}`,
        token: await hashMcpOAuthToken(firstAccessToken),
        clientId,
        userId,
        referenceId: organizationId,
        refreshId: firstRefreshId,
        createdAt: new Date(now.getTime() - 2_000),
        expiresAt,
        scopes: ["offline_access", "issues:read"],
      },
      {
        id: `access-active-${suffix}`,
        token: await hashMcpOAuthToken(activeAccessToken),
        clientId,
        userId,
        referenceId: organizationId,
        refreshId: activeRefreshId,
        createdAt: new Date(now.getTime() - 1_000),
        expiresAt,
        scopes: ["offline_access", "issues:read"],
      },
      {
        id: `access-other-${suffix}`,
        token: await hashMcpOAuthToken(otherAccessToken),
        clientId,
        userId,
        referenceId: otherOrganizationId,
        refreshId: otherRefreshId,
        createdAt: now,
        expiresAt,
        scopes: ["offline_access", "issues:read"],
      },
    ])

    const families = await listMcpOAuthCredentialFamilies(db, userId)
    expect(families).toHaveLength(2)
    expect(
      families.filter(({ organizationId: listed }) => listed === organizationId)
    ).toEqual([
      expect.objectContaining({
        credentialId: `r_${activeRefreshId}`,
        refreshable: true,
      }),
    ])

    await expect(
      revokeMcpOAuthCredentialFamily({
        database: db,
        credentialId: `r_${activeRefreshId}`,
        userId,
      })
    ).resolves.toBe(true)
    await expect(
      verifyMcpOAuthAccessToken(`mcp_at_${firstAccessToken}`)
    ).resolves.toBeNull()
    await expect(
      verifyMcpOAuthAccessToken(`mcp_at_${activeAccessToken}`)
    ).resolves.toBeNull()
    await expect(
      verifyMcpOAuthAccessToken(`mcp_at_${otherAccessToken}`)
    ).resolves.toMatchObject({ organizationId: otherOrganizationId })
    await expect(
      db
        .select({ id: schema.oauthAccessToken.id })
        .from(schema.oauthAccessToken)
        .where(
          and(
            eq(schema.oauthAccessToken.clientId, clientId),
            eq(schema.oauthAccessToken.userId, userId)
          )
        )
    ).resolves.toEqual([{ id: `access-other-${suffix}` }])
  })
})
