import { sql } from "drizzle-orm"
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
    "http://github.emulate.localhost:4001"
  )
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_ID", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_SECRET", "")
  vi.stubEnv("TRUSTED_ORIGINS", "http://app.localhost")
  vi.stubEnv("TURSO_DATABASE_URL", "file::memory:")
  vi.stubEnv("EMAIL_PROVIDER", "noop")
  vi.stubEnv("EMAIL_FROM", "noreply@example.com")
  vi.stubEnv("MAILPIT_URL", "")

  const [authModule, databaseModule, schema] = await Promise.all([
    import("../index"),
    import("@enterprise-agentic-saas/db"),
    import("@enterprise-agentic-saas/db/schema"),
  ])
  auth = authModule.auth

  await databaseModule.db.run(
    sql.raw(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER DEFAULT 0 NOT NULL,
        image TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  )
  await databaseModule.db.run(
    sql.raw(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY NOT NULL,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        active_organization_id TEXT
      )
    `)
  )
  await databaseModule.db.run(
    sql.raw(`
      CREATE TABLE verification (
        id TEXT PRIMARY KEY NOT NULL,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  )

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

describe("Better Auth GitHub emulator routing", () => {
  it("registers only generic OAuth and permits HTTP cookies in local tests", () => {
    expect(auth.options.socialProviders).toEqual({})
    expect(
      auth.options.plugins?.filter((plugin) => plugin.id === "generic-oauth")
    ).toHaveLength(1)
    expect(auth.options.advanced?.useSecureCookies).toBe(false)
  })

  it("keeps signIn.social and routes its callback to generic OAuth", async () => {
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
    expect(authorizationUrl.pathname).toBe("/login/oauth/authorize")
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "enterprise-agentic-saas-local"
    )
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://api.localhost/auth/oauth2/callback/github"
    )
    expect(authorizationUrl.searchParams.get("scope")).toContain("read:user")
    expect(authorizationUrl.searchParams.get("scope")).toContain("user:email")
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy()
    expect(result.redirect).toBe(true)
  })

  it("keeps linkSocial and routes its callback to generic OAuth", async () => {
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

    expect(authorizationUrl.pathname).toBe("/login/oauth/authorize")
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://api.localhost/auth/oauth2/callback/github"
    )
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy()
  })
})
