import { makeSignature } from "better-auth/crypto"
import { migrate } from "drizzle-orm/libsql/migrator"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { auth as Auth } from "./index"
import type { AuthOpenApiSchema } from "./openapi"

type AuthInstance = typeof Auth
type AuthSessionResult = NonNullable<
  Awaited<ReturnType<AuthInstance["api"]["getSession"]>>
>

const readActiveOrganizationId = (result: AuthSessionResult) =>
  result.session.activeOrganizationId

let auth: AuthInstance
let blockedOrganizationPluginEndpoints: ReadonlyArray<{
  method: "GET" | "POST"
  path: string
}>
let organizationSecurityHooks: {
  beforeAcceptInvitation(input: {
    invitation: { role?: string | null }
  }): Promise<void>
}
let generateAuthOpenApiSchema: () => Promise<AuthOpenApiSchema>
let createPasskeySessionHeaders: (ageInMilliseconds: number) => Promise<Headers>

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
  blockedOrganizationPluginEndpoints =
    authModule.blockedOrganizationPluginEndpoints
  organizationSecurityHooks = authModule.organizationSecurityHooks
  const authOpenApiModule = await import("./openapi")
  generateAuthOpenApiSchema = authOpenApiModule.generateAuthOpenApiSchema

  const [{ db }, schema] = await Promise.all([
    import("@enterprise-agentic-saas/db"),
    import("@enterprise-agentic-saas/db/schema"),
  ])
  await migrate(db, {
    migrationsFolder: new URL("../../db/drizzle", import.meta.url).pathname,
  })

  let sessionSequence = 0
  createPasskeySessionHeaders = async (ageInMilliseconds) => {
    sessionSequence += 1
    const suffix = `${sessionSequence}-${crypto.randomUUID()}`
    const userId = `passkey-user-${suffix}`
    const token = `passkey-session-${suffix}`
    const createdAt = new Date(Date.now() - ageInMilliseconds)

    await db.insert(schema.user).values({
      id: userId,
      name: "Passkey Test User",
      email: `passkey-${suffix}@example.test`,
      emailVerified: true,
      createdAt,
      updatedAt: createdAt,
    })
    await db.insert(schema.session).values({
      id: `session-${suffix}`,
      token,
      userId,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    const context = await auth.$context
    const signedToken = `${token}.${await makeSignature(token, context.secret)}`
    return new Headers({
      cookie: `${context.authCookies.sessionToken.name}=${signedToken}`,
      origin: "http://app.localhost",
    })
  }
})

describe("passkey registration security boundary", () => {
  it("generates options for a fresh session with the configured RP identity", async () => {
    const headers = await createPasskeySessionHeaders(60_000)
    const response = await auth.handler(
      new Request(
        "http://api.localhost/auth/passkey/generate-register-options",
        { headers }
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      challenge: expect.any(String),
      rp: {
        id: "app.localhost",
        name: "Enterprise Agentic SaaS",
      },
      user: {
        displayName: expect.stringMatching(/@example\.test$/u),
        name: expect.stringMatching(/@example\.test$/u),
      },
    })

    const passkeyPlugin = auth.options.plugins?.find(
      (plugin) => plugin.id === "passkey"
    )
    expect(passkeyPlugin?.options).toMatchObject({
      origin: ["http://app.localhost"],
      rpID: "app.localhost",
    })
  })

  it("rejects registration options when the session is no longer fresh", async () => {
    const headers = await createPasskeySessionHeaders(16 * 60 * 1000)
    const response = await auth.handler(
      new Request(
        "http://api.localhost/auth/passkey/generate-register-options",
        { headers }
      )
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      code: "SESSION_NOT_FRESH",
    })
  })
})

describe("organization invitation acceptance", () => {
  it("accepts only app-issued admin and member roles", async () => {
    await expect(
      organizationSecurityHooks.beforeAcceptInvitation({
        invitation: { role: "admin" },
      })
    ).resolves.toBeUndefined()
    await expect(
      organizationSecurityHooks.beforeAcceptInvitation({
        invitation: { role: "member" },
      })
    ).resolves.toBeUndefined()

    await Promise.all(
      ["owner", "super_admin", null, undefined].map((role) =>
        expect(
          organizationSecurityHooks.beforeAcceptInvitation({
            invitation: { role },
          })
        ).rejects.toMatchObject({
          statusCode: 400,
          body: { code: "INVALID_ORGANIZATION_INVITATION_ROLE" },
        })
      )
    )
  })
})

describe("app-owned organization boundary", () => {
  it("returns 404 for every Better Auth organization management endpoint", async () => {
    const responses = await Promise.all(
      blockedOrganizationPluginEndpoints.map(({ method, path }) =>
        auth.handler(
          new Request(`http://api.localhost/auth${path}`, {
            method,
            headers: {
              "content-type": "application/json",
              origin: "http://app.localhost",
              cookie: "better-auth.session_token=authenticated-admin-session",
            },
            ...(method === "POST" ? { body: "{}" } : {}),
          })
        )
      )
    )

    expect(responses.map((response) => response.status)).toEqual(
      blockedOrganizationPluginEndpoints.map(() => 404)
    )
  })

  it("generates the enabled auth routes and only recipient-facing organization routes", async () => {
    const schema = await generateAuthOpenApiSchema()
    const paths = Object.keys(schema.paths)

    expect(paths).toEqual(
      expect.arrayContaining([
        "/sign-in/magic-link",
        "/passkey/generate-register-options",
        "/multi-session/list-device-sessions",
      ])
    )

    const organizationPaths = paths.filter((path) =>
      path.startsWith("/organization/")
    )

    expect(organizationPaths).toHaveLength(4)
    expect(organizationPaths).toEqual(
      expect.arrayContaining([
        "/organization/get-invitation",
        "/organization/list-user-invitations",
        "/organization/accept-invitation",
        "/organization/reject-invitation",
      ])
    )
    expect(paths).toEqual(
      expect.not.arrayContaining(
        blockedOrganizationPluginEndpoints.map(({ path }) => path)
      )
    )
  })

  it("disables the separate Better Auth reference page", async () => {
    const response = await auth.handler(
      new Request("http://api.localhost/auth/reference")
    )

    expect(response.status).toBe(404)
  })
})

describe("verification secret handling", () => {
  it("hashes verification identifiers and magic-link tokens at rest", () => {
    expect(auth.options.verification?.storeIdentifier).toBe("hashed")
    expect(
      auth.options.plugins?.find((plugin) => plugin.id === "magic-link")
        ?.options
    ).toMatchObject({ storeToken: "hashed" })
  })

  it("does not log a submitted token or database error arguments", async () => {
    const submittedToken = "AUDIT_DUMMY_MAGIC_TOKEN_NOT_REAL"
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    try {
      const response = await auth.handler(
        new Request(
          `http://api.localhost/auth/magic-link/verify?token=${submittedToken}&callbackURL=%2Fdashboard`,
          {
            headers: {
              origin: "http://app.localhost",
              cookie: "better-auth.session_token=secret-cookie-value",
            },
          }
        )
      )
      expect(response.status).toBe(302)
      expect(response.headers.get("location")).not.toContain(submittedToken)

      auth.options.logger?.log?.(
        "error",
        submittedToken,
        new Error(
          `select from verification params: ${submittedToken} secret-cookie-value`
        )
      )
      const serializedLogs = JSON.stringify([
        ...errorSpy.mock.calls,
        ...warnSpy.mock.calls,
      ])
      expect(serializedLogs).not.toContain(submittedToken)
      expect(serializedLogs).not.toContain("secret-cookie-value")
      expect(serializedLogs).not.toContain("params")
      expect(serializedLogs).not.toContain("SELECT")
      expect(errorSpy).toHaveBeenCalledWith({
        component: "better-auth",
        event: "request_failed",
        level: "error",
      })
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})

describe("built-in GitHub OAuth boundary", () => {
  it("keeps the built-in provider and callback when the emulator is disabled", async () => {
    expect(auth.options.socialProviders).toMatchObject({
      github: {
        clientId: "test-github-client",
        clientSecret: "test-github-secret",
      },
    })
    expect(
      auth.options.plugins?.filter((plugin) => plugin.id === "generic-oauth")
    ).toHaveLength(0)

    const context = await auth.$context
    const githubProvider = context.socialProviders.find(
      (provider) => provider.id === "github"
    )
    if (!githubProvider) {
      throw new Error("Expected the built-in GitHub provider")
    }
    const authorizationUrl = await githubProvider.createAuthorizationURL({
      state: "test-state",
      codeVerifier: "test-code-verifier",
      redirectURI: "http://api.localhost/auth/callback/github",
    })

    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://api.localhost/auth/callback/github"
    )
    expect(auth.options.advanced?.useSecureCookies).toBe(false)
  })
})

describe("plugin inference contract", () => {
  it("retains organization fields on the core getSession result", async () => {
    const session = await auth.api.getSession({ headers: new Headers() })

    expect(session).toBeNull()
    expect(readActiveOrganizationId).toBeTypeOf("function")
  })
})
