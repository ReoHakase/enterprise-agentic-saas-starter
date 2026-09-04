import { migrate } from "drizzle-orm/libsql/migrator"
import * as v from "valibot"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { auth as Auth } from "../index"

type AuthInstance = typeof Auth

const authSecret = "test-secret-at-least-32-characters-long"
const sessionToken = "github-oauth-emulator-session-token"
const redirectResponseSchema = v.object({
  url: v.pipe(v.string(), v.url()),
  redirect: v.boolean(),
})
const oauthResourceManagementRequests = [
  { method: "GET", path: "/admin/oauth2/resources" },
  { method: "POST", path: "/admin/oauth2/resources" },
  {
    method: "GET",
    path: "/admin/oauth2/resources/https%3A%2F%2Fresource.example.test",
  },
  {
    method: "PATCH",
    path: "/admin/oauth2/resources/https%3A%2F%2Fresource.example.test",
  },
  {
    method: "DELETE",
    path: "/admin/oauth2/resources/https%3A%2F%2Fresource.example.test",
  },
  {
    method: "POST",
    path: "/admin/oauth2/resources/https%3A%2F%2Fresource.example.test/clients/client-41",
  },
  {
    method: "DELETE",
    path: "/admin/oauth2/resources/https%3A%2F%2Fresource.example.test/clients/client-41",
  },
] as const

let auth: AuthInstance
let signedSessionCookie: string

const signCookieValue = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  )
  const encodedSignature = btoa(
    String.fromCodePoint(...new Uint8Array(signature))
  )
  return encodeURIComponent(`${value}.${encodedSignature}`)
}

const createRequest = (path: string, body: Record<string, unknown>) =>
  new Request(`http://api.localhost/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://app.localhost",
      ...(signedSessionCookie
        ? {
            cookie: `better-auth.session_token=${signedSessionCookie}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
  })

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("BETTER_AUTH_SECRET", authSecret)
  vi.stubEnv("BETTER_AUTH_URL", "http://api.localhost")
  vi.stubEnv("AUTH_COOKIE_DOMAIN", "localhost")
  vi.stubEnv("GITHUB_CLIENT_ID", "real-github-client-must-not-be-used")
  vi.stubEnv("GITHUB_CLIENT_SECRET", "real-github-secret-must-not-be-used")
  vi.stubEnv(
    "GITHUB_OAUTH_EMULATOR_URL",
    "http://github.emulate.localhost:4001/emulate/github"
  )
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_ID", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_SECRET", "")
  vi.stubEnv("TRUSTED_ORIGINS", "http://app.localhost")
  vi.stubEnv("TURSO_DATABASE_URL", "file::memory:")
  vi.stubEnv("EMAIL_PROVIDER", "noop")
  vi.stubEnv("EMAIL_FROM", "noreply@example.com")
  vi.stubEnv("MAILPIT_URL", "")

  const [databaseModule, schema] = await Promise.all([
    import("@enterprise-agentic-saas/db"),
    import("@enterprise-agentic-saas/db/schema"),
  ])
  await migrate(databaseModule.db, {
    migrationsFolder: new URL("../../../db/drizzle-v3", import.meta.url)
      .pathname,
  })

  const authModule = await import("../index")
  auth = authModule.auth

  const now = new Date()
  await databaseModule.db.insert(schema.user).values({
    id: "oauth-link-user",
    name: "OAuth Link User",
    email: "oauth-link@example.test",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await databaseModule.db.insert(schema.session).values({
    id: "oauth-link-session",
    token: sessionToken,
    userId: "oauth-link-user",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: null,
  })
  signedSessionCookie = await signCookieValue(sessionToken, authSecret)
}, 30_000)

afterAll(() => {
  vi.unstubAllEnvs()
})

describe("Better AuthのGitHubエミュレーター経路", () => {
  it("social sign-inをエミュレーターの標準コールバックへ接続する", async () => {
    signedSessionCookie = ""
    const response = await auth.handler(
      createRequest("/sign-in/social", {
        provider: "github",
        callbackURL: "http://app.localhost/settings/accounts",
      })
    )
    expect(response.status).toBe(200)
    const result = v.parse(redirectResponseSchema, await response.json())
    const authorizationUrl = new URL(result.url)

    expect(authorizationUrl.origin).toBe("http://github.emulate.localhost:4001")
    expect(authorizationUrl.pathname).toBe(
      "/emulate/github/login/oauth/authorize"
    )
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "enterprise-agentic-saas-local"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://api.localhost/auth/callback/github"
    )
    expect(authorizationUrl.searchParams.get("scope")).toContain("read:user")
    expect(authorizationUrl.searchParams.get("scope")).toContain("user:email")
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy()
    expect(result.redirect).toBe(true)
  })

  it("アカウント連携をエミュレーターの標準コールバックへ接続する", async () => {
    signedSessionCookie = await signCookieValue(sessionToken, authSecret)
    const response = await auth.handler(
      createRequest("/link-social", {
        provider: "github",
        callbackURL: "http://app.localhost/settings/accounts",
      })
    )
    expect(response.status).toBe(200)
    const result = v.parse(redirectResponseSchema, await response.json())
    const authorizationUrl = new URL(result.url)

    expect(authorizationUrl.pathname).toBe(
      "/emulate/github/login/oauth/authorize"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://api.localhost/auth/callback/github"
    )
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy()
  })

  it("削除済みのGeneric OAuthコールバック別名を公開しない", async () => {
    const legacyResponse = await auth.handler(
      new Request(
        "http://api.localhost/auth/oauth2/callback/github?code=test&state=test"
      )
    )
    const standardResponse = await auth.handler(
      new Request(
        "http://api.localhost/auth/callback/github?code=test&state=test"
      )
    )

    expect(legacyResponse.status).toBe(404)
    expect(standardResponse.status).not.toBe(404)
  })

  it("OAuth resource管理経路を全methodで拒否する", async () => {
    const responses = await Promise.all(
      oauthResourceManagementRequests.map(({ method, path }) =>
        auth.handler(
          new Request(`http://api.localhost/auth${path}`, {
            method,
            headers: {
              "content-type": "application/json",
              cookie: `better-auth.session_token=${signedSessionCookie}`,
              origin: "http://app.localhost",
            },
            ...(method === "POST" || method === "PATCH" ? { body: "{}" } : {}),
          })
        )
      )
    )
    const openApi = await auth.api.generateOpenAPISchema()

    expect(responses.map(({ status }) => status)).toEqual(
      oauthResourceManagementRequests.map(() => 404)
    )
    expect(auth.options.disabledPaths).toEqual(
      expect.arrayContaining([
        "/admin/oauth2/resources",
        "/admin/oauth2/resources/:identifier",
        "/admin/oauth2/resources/:identifier/clients/:client_id",
      ])
    )
    expect(Object.keys(openApi.paths)).toEqual(
      expect.not.arrayContaining([
        "/admin/oauth2/resources",
        "/admin/oauth2/resources/:identifier",
        "/admin/oauth2/resources/:identifier/clients/:client_id",
      ])
    )
  })
})
