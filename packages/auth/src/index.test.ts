import { beforeAll, describe, expect, it, vi } from "vitest"

import type { auth as Auth } from "./index"

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

  it("publishes only invitation-recipient routes in the auth reference", async () => {
    const response = await auth.handler(
      new Request("http://api.localhost/auth/open-api/generate-schema")
    )
    expect(response.status).toBe(200)
    const schema = await response.json()
    const paths = Object.keys(schema.paths)

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
      await expect(
        auth.handler(
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
      ).rejects.toThrow()

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
