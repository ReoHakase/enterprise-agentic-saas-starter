import { createServer, type Server } from "node:http"

import type {
  backgroundTaskHandler as BackgroundTaskHandler,
  createRuntimeEmailSender as CreateRuntimeEmailSender,
} from "@enterprise-agentic-saas/email/runtime"
import { makeSignature } from "better-auth/crypto"
import { eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type {
  auth as Auth,
  getMcpProtectedResourceMetadata as GetMcpProtectedResourceMetadata,
  handleMcpOAuthServerMetadata as HandleMcpOAuthServerMetadata,
  mcpOAuthIssuer as McpOAuthIssuer,
  mcpOAuthResource as McpOAuthResource,
} from "./index"

type EmailRuntimeModule = {
  backgroundTaskHandler: typeof BackgroundTaskHandler
  createRuntimeEmailSender: typeof CreateRuntimeEmailSender
}

const emailSpies = vi.hoisted(() => ({
  send: vi.fn<() => Promise<void>>(),
}))

vi.mock("@enterprise-agentic-saas/email/runtime", async (importOriginal) => ({
  ...(await importOriginal<EmailRuntimeModule>()),
  createRuntimeEmailSender: () => emailSpies.send,
}))

type AuthInstance = typeof Auth
let auth: AuthInstance
let getMcpProtectedResourceMetadata: typeof GetMcpProtectedResourceMetadata
let handleMcpOAuthServerMetadata: typeof HandleMcpOAuthServerMetadata
let mcpOAuthIssuer: typeof McpOAuthIssuer
let mcpOAuthResource: typeof McpOAuthResource
let blockedOrganizationPluginEndpoints: ReadonlyArray<{
  method: "GET" | "POST"
  path: string
}>
let organizationSecurityHooks: {
  beforeCreateInvitation(input: {
    invitation: { role?: string | null }
  }): Promise<void>
  beforeAcceptInvitation(input: {
    invitation: { role?: string | null }
  }): Promise<void>
}
let createPasskeySessionHeaders: (ageInMilliseconds: number) => Promise<Headers>
let createOrganizationOwnerFixture: () => Promise<{
  headers: Headers
  organizationId: string
}>
let createMultiSessionFixture: () => Promise<{
  cookie: string
  tokens: string[]
  userIds: string[]
}>
let sessionExists: (token: string) => Promise<boolean>
let authServer: Server | undefined
let authServerBaseUrl: string

type InvitationRoleHook = (input: {
  invitation: { role?: string | null }
}) => Promise<void>

const assertInvitationRoleBoundary = async (hook: InvitationRoleHook) => {
  await expect(hook({ invitation: { role: "admin" } })).resolves.toBeUndefined()
  await expect(
    hook({ invitation: { role: "member" } })
  ).resolves.toBeUndefined()
  await Promise.all(
    ["owner", "super_admin", null, undefined].map((role) =>
      expect(hook({ invitation: { role } })).rejects.toMatchObject({
        statusCode: 400,
        body: { code: "INVALID_ORGANIZATION_INVITATION_ROLE" },
      })
    )
  )
}

beforeAll(async () => {
  emailSpies.send.mockResolvedValue(undefined)
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
  const [{ db }, schema] = await Promise.all([
    import("@enterprise-agentic-saas/db"),
    import("@enterprise-agentic-saas/db/schema"),
  ])
  await migrate(db, {
    migrationsFolder: new URL("../../db/drizzle-v3", import.meta.url).pathname,
  })

  const authModule = await import("./index")
  auth = authModule.auth
  getMcpProtectedResourceMetadata = authModule.getMcpProtectedResourceMetadata
  handleMcpOAuthServerMetadata = authModule.handleMcpOAuthServerMetadata
  mcpOAuthIssuer = authModule.mcpOAuthIssuer
  mcpOAuthResource = authModule.mcpOAuthResource
  blockedOrganizationPluginEndpoints =
    authModule.blockedOrganizationPluginEndpoints
  organizationSecurityHooks = authModule.organizationSecurityHooks

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
  createOrganizationOwnerFixture = async () => {
    sessionSequence += 1
    const suffix = `${sessionSequence}-${crypto.randomUUID()}`
    const userId = `organization-owner-${suffix}`
    const token = `organization-owner-session-${suffix}`
    const organizationId = `organization-${suffix}`
    const now = new Date()

    await db.insert(schema.user).values({
      id: userId,
      name: "Organization Owner",
      email: `owner-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.organization).values({
      id: organizationId,
      name: "Native Invitation Organization",
      slug: `native-invitation-${suffix}`,
      createdAt: now,
    })
    await db.insert(schema.member).values({
      id: `owner-membership-${suffix}`,
      organizationId,
      userId,
      role: "owner",
      createdAt: now,
    })
    await db.insert(schema.session).values({
      id: `owner-session-row-${suffix}`,
      token,
      userId,
      activeOrganizationId: organizationId,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    })

    const context = await auth.$context
    const signedToken = `${token}.${await makeSignature(token, context.secret)}`
    return {
      headers: new Headers({
        "content-type": "application/json",
        cookie: `${context.authCookies.sessionToken.name}=${signedToken}`,
        origin: "http://app.localhost",
      }),
      organizationId,
    }
  }
  createMultiSessionFixture = async () => {
    const context = await auth.$context
    const createdAt = new Date()
    const accounts = Array.from({ length: 2 }, (_, index) => {
      const suffix = `${crypto.randomUUID()}-${index}`

      return {
        index,
        sessionId: `multi-row-${suffix}`,
        token: `multi-session-${suffix}`.toLowerCase(),
        userId: `multi-user-${suffix}`,
        email: `multi-${suffix}@example.test`,
      }
    })

    await db.insert(schema.user).values(
      accounts.map(({ email, index, userId }) => ({
        id: userId,
        name: `Multi Session User ${index}`,
        email,
        emailVerified: true,
        createdAt,
        updatedAt: createdAt,
      }))
    )
    await db.insert(schema.session).values(
      accounts.map(({ sessionId, token, userId }) => ({
        id: sessionId,
        token,
        userId,
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }))
    )

    const signedAccounts = await Promise.all(
      accounts.map(async ({ token }) => ({
        signedToken: `${token}.${await makeSignature(token, context.secret)}`,
        token,
      }))
    )
    const activeAccount = signedAccounts.at(0)
    if (!activeAccount) {
      throw new Error("A multi-session fixture requires at least one account")
    }
    const cookies = signedAccounts.map(
      ({ signedToken, token }) =>
        `${context.authCookies.sessionToken.name}_multi-${token}=${signedToken}`
    )
    cookies.unshift(
      `${context.authCookies.sessionToken.name}=${activeAccount.signedToken}`
    )

    return {
      cookie: cookies.join("; "),
      tokens: accounts.map(({ token }) => token),
      userIds: accounts.map(({ userId }) => userId),
    }
  }
  sessionExists = async (token) => {
    const rows = await db
      .select({ token: schema.session.token })
      .from(schema.session)
      .where(eq(schema.session.token, token))
      .limit(1)
    return rows.length === 1
  }

  authServer = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = []
    for await (const chunk of incoming) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const body = Buffer.concat(chunks)
    const requestHeaders = new Headers()
    for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
      const name = incoming.rawHeaders[index]
      const value = incoming.rawHeaders[index + 1]
      if (name && value) requestHeaders.append(name, value)
    }
    const requestInit: RequestInit & { duplex: "half" } = {
      method: incoming.method,
      headers: requestHeaders,
      body: body.length > 0 ? body : undefined,
      duplex: "half",
    }
    const response = await auth.handler(
      new Request(
        `http://${incoming.headers.host}${incoming.url ?? "/"}`,
        requestInit
      )
    )
    outgoing.statusCode = response.status
    for (const [name, value] of response.headers) {
      if (name !== "set-cookie") outgoing.setHeader(name, value)
    }
    const setCookies = response.headers.getSetCookie()
    if (setCookies.length > 0) outgoing.setHeader("set-cookie", setCookies)
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) =>
    authServer?.listen(0, "127.0.0.1", resolve)
  )
  const address = authServer.address()
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP auth server")
  }
  authServerBaseUrl = `http://127.0.0.1:${address.port}`
}, 30_000)

afterAll(
  () =>
    new Promise<void>((resolve, reject) => {
      authServer?.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
)

type StoredAuthCookie = {
  domain: string
  expiresAt?: number
  hostOnly: boolean
  httpOnly: boolean
  name: string
  path: string
  sameSite: "lax" | "strict" | "none"
  secure: boolean
  value: string
}

const logicalAuthOrigin = "http://api.localhost"

const domainMatches = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`)

const pathMatches = (pathname: string, cookiePath: string) =>
  pathname === cookiePath ||
  pathname.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`)

class AuthCookieJar {
  readonly #cookies = new Map<string, StoredAuthCookie>()

  constructor(cookie: string) {
    for (const entry of cookie.split(";")) {
      const separator = entry.indexOf("=")
      if (separator === -1) continue
      const name = entry.slice(0, separator).trim()
      this.#store({
        domain: "localhost",
        hostOnly: false,
        httpOnly: true,
        name,
        path: "/",
        sameSite: "lax",
        secure: false,
        value: entry.slice(separator + 1).trim(),
      })
    }
  }

  get header() {
    return this.#headerFor(new URL(logicalAuthOrigin))
  }

  #key(cookie: Pick<StoredAuthCookie, "domain" | "name" | "path">) {
    return `${cookie.domain}\u0000${cookie.path}\u0000${cookie.name}`
  }

  #store(cookie: StoredAuthCookie) {
    this.#cookies.set(this.#key(cookie), cookie)
  }

  #headerFor(url: URL) {
    const now = Date.now()
    return [...this.#cookies.values()]
      .filter(
        (cookie) =>
          (cookie.expiresAt === undefined || cookie.expiresAt > now) &&
          (cookie.hostOnly
            ? url.hostname === cookie.domain
            : domainMatches(url.hostname, cookie.domain)) &&
          pathMatches(url.pathname, cookie.path) &&
          (!cookie.secure || url.protocol === "https:")
      )
      .toSorted((left, right) => right.path.length - left.path.length)
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ")
  }

  #acceptSetCookie(setCookie: string, requestUrl: URL) {
    const [pair, ...attributeParts] = setCookie.split(";")
    const separator = pair?.indexOf("=") ?? -1
    if (!pair || separator <= 0) {
      throw new Error("Auth returned an invalid Set-Cookie pair")
    }

    const attributes = new Map<string, string | true>()
    for (const part of attributeParts) {
      const trimmed = part.trim()
      const attributeSeparator = trimmed.indexOf("=")
      const name = (
        attributeSeparator === -1
          ? trimmed
          : trimmed.slice(0, attributeSeparator)
      ).toLowerCase()
      const value =
        attributeSeparator === -1 ? true : trimmed.slice(attributeSeparator + 1)
      if (
        ![
          "domain",
          "expires",
          "httponly",
          "max-age",
          "path",
          "samesite",
          "secure",
        ].includes(name)
      ) {
        throw new Error(
          `Auth returned an unsupported cookie attribute: ${name}`
        )
      }
      attributes.set(name, value)
    }

    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    const domainValue = attributes.get("domain")
    const domain =
      typeof domainValue === "string"
        ? domainValue.toLowerCase().replace(/^\./u, "")
        : requestUrl.hostname
    const pathValue = attributes.get("path")
    const path = typeof pathValue === "string" ? pathValue : "/auth"
    const sameSiteValue = attributes.get("samesite")
    const sameSite =
      typeof sameSiteValue === "string" ? sameSiteValue.toLowerCase() : ""

    if (
      domain !== "localhost" ||
      !domainMatches(requestUrl.hostname, domain) ||
      path !== "/" ||
      attributes.get("httponly") !== true ||
      sameSite !== "lax" ||
      attributes.has("secure")
    ) {
      throw new Error(
        "Auth returned unsafe or incorrectly scoped cookie attributes"
      )
    }

    const maxAgeValue = attributes.get("max-age")
    const maxAge =
      typeof maxAgeValue === "string" ? Number(maxAgeValue) : undefined
    if (maxAgeValue !== undefined && !Number.isFinite(maxAge)) {
      throw new Error("Auth returned an invalid cookie Max-Age")
    }
    const expiresValue = attributes.get("expires")
    const expiresAt =
      maxAge !== undefined
        ? Date.now() + maxAge * 1000
        : typeof expiresValue === "string"
          ? Date.parse(expiresValue)
          : undefined
    if (expiresValue !== undefined && !Number.isFinite(expiresAt)) {
      throw new Error("Auth returned an invalid cookie Expires")
    }

    const cookie: StoredAuthCookie = {
      domain,
      expiresAt,
      hostOnly: typeof domainValue !== "string",
      httpOnly: true,
      name,
      path,
      sameSite: "lax",
      secure: false,
      value,
    }
    if (value === "" || maxAge === 0 || (expiresAt ?? Infinity) <= Date.now()) {
      this.#cookies.delete(this.#key(cookie))
      return
    }
    this.#store(cookie)
  }

  async fetch(path: string, init?: RequestInit) {
    const logicalUrl = new URL(path, logicalAuthOrigin)
    const headers = new Headers(init?.headers)
    const cookieHeader = this.#headerFor(logicalUrl)
    if (cookieHeader) headers.set("cookie", cookieHeader)
    headers.set("host", logicalUrl.host)
    headers.set("origin", "http://app.localhost")
    const response = await fetch(`${authServerBaseUrl}${path}`, {
      ...init,
      headers,
    })

    for (const setCookie of response.headers.getSetCookie()) {
      this.#acceptSetCookie(setCookie, logicalUrl)
    }

    return response
  }
}

const revokeDeviceSession = (cookieJar: AuthCookieJar, sessionToken: string) =>
  cookieJar.fetch("/auth/multi-session/revoke", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ sessionToken }),
  })

const getAuthenticatedSession = (cookieJar: AuthCookieJar) =>
  cookieJar.fetch("/auth/get-session")

describe("Passkey登録のセキュリティ境界", () => {
  it("15分以内のsessionでは設定済みのRP情報を返す", async () => {
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
  })

  it("15分を超えたsessionでは登録optionを拒否する", async () => {
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

describe("現在のアカウントだけを失効するmulti-session境界", () => {
  it("現在のアカウントを失効すると残るアカウントを選択する", async () => {
    const fixture = await createMultiSessionFixture()
    const cookieJar = new AuthCookieJar(fixture.cookie)
    const response = await revokeDeviceSession(
      cookieJar,
      fixture.tokens[0] ?? ""
    )
    const sessionResponse = await getAuthenticatedSession(cookieJar)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: true })
    expect(await sessionExists(fixture.tokens[0] ?? "")).toBe(false)
    expect(await sessionExists(fixture.tokens[1] ?? "")).toBe(true)
    expect(sessionResponse.status).toBe(200)
    expect(await sessionResponse.json()).toMatchObject({
      session: { token: fixture.tokens[1] },
      user: { id: fixture.userIds[1] },
    })
  })

  it("不正なトークンではcookieと保存済みsessionを変更しない", async () => {
    const fixture = await createMultiSessionFixture()
    const cookieJar = new AuthCookieJar(fixture.cookie)
    const cookieBefore = cookieJar.header
    const response = await revokeDeviceSession(
      cookieJar,
      "invalid-session-token"
    )
    const cookieAfterFailure = cookieJar.header
    const sessionResponse = await getAuthenticatedSession(cookieJar)

    expect(response.status).toBe(401)
    expect(decodeURIComponent(cookieAfterFailure)).toBe(cookieBefore)
    expect(await sessionExists(fixture.tokens[0] ?? "")).toBe(true)
    expect(await sessionExists(fixture.tokens[1] ?? "")).toBe(true)
    expect(await sessionResponse.json()).toMatchObject({
      session: { token: fixture.tokens[0] },
      user: { id: fixture.userIds[0] },
    })
  })
})

describe("organization招待の境界", () => {
  it("作成前と受諾前にadminとmemberだけを許可する", async () => {
    expect.hasAssertions()
    await Promise.all(
      [
        organizationSecurityHooks.beforeCreateInvitation,
        organizationSecurityHooks.beforeAcceptInvitation,
      ].map(assertInvitationRoleBoundary)
    )
  })

  it("公開経路ではowner roleを保存前に拒否する", async () => {
    const fixture = await createOrganizationOwnerFixture()
    emailSpies.send.mockClear()
    const response = await auth.handler(
      new Request("http://api.localhost/auth/organization/invite-member", {
        method: "POST",
        headers: fixture.headers,
        body: JSON.stringify({
          email: "owner-invite@example.test",
          organizationId: fixture.organizationId,
          resend: false,
          role: "owner",
        }),
      })
    )
    const [{ db }, schema] = await Promise.all([
      import("@enterprise-agentic-saas/db"),
      import("@enterprise-agentic-saas/db/schema"),
    ])
    const storedInvitations = await db
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(eq(schema.invitation.organizationId, fixture.organizationId))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: "INVALID_ORGANIZATION_INVITATION_ROLE",
    })
    expect(storedInvitations).toEqual([])
    expect(emailSpies.send).not.toHaveBeenCalled()
  })

  it("配送失敗時もpending招待を保持して機密情報を記録しない", async () => {
    const fixture = await createOrganizationOwnerFixture()
    const rawFailure = "provider token=raw-invitation-secret"
    const recipient = "member@example.test"
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    emailSpies.send.mockClear()
    emailSpies.send.mockRejectedValueOnce(new Error(rawFailure))

    try {
      const response = await auth.handler(
        new Request("http://api.localhost/auth/organization/invite-member", {
          method: "POST",
          headers: fixture.headers,
          body: JSON.stringify({
            email: recipient,
            organizationId: fixture.organizationId,
            resend: false,
            role: "member",
          }),
        })
      )
      const created = await response.json()
      const [{ db }, schema] = await Promise.all([
        import("@enterprise-agentic-saas/db"),
        import("@enterprise-agentic-saas/db/schema"),
      ])
      const storedInvitations = await db
        .select({
          email: schema.invitation.email,
          id: schema.invitation.id,
          role: schema.invitation.role,
          status: schema.invitation.status,
        })
        .from(schema.invitation)
        .where(eq(schema.invitation.organizationId, fixture.organizationId))

      expect(response.status).toBe(200)
      expect(created).toMatchObject({
        email: recipient,
        organizationId: fixture.organizationId,
        role: "member",
        status: "pending",
      })
      expect(storedInvitations).toEqual([
        {
          email: recipient,
          id: created.id,
          role: "member",
          status: "pending",
        },
      ])
      expect(emailSpies.send).toHaveBeenCalledTimes(1)
      expect(errorLog).toHaveBeenCalledWith({
        component: "better-auth",
        event: "request_failed",
        level: "error",
      })
      const serializedLogs = JSON.stringify(errorLog.mock.calls)
      expect(serializedLogs).not.toContain(rawFailure)
      expect(serializedLogs).not.toContain(recipient)
      expect(serializedLogs).not.toContain("/invitations/")
    } finally {
      errorLog.mockRestore()
    }
  })
})

describe("アプリケーション所有のorganization境界", () => {
  it("Better Authのorganization管理経路をすべて404にする", async () => {
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

  it("招待と受信者向けorganization経路を標準OpenAPIへ公開する", async () => {
    const schema = await auth.api.generateOpenAPISchema()
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

    expect(organizationPaths).toHaveLength(5)
    expect(organizationPaths).toEqual(
      expect.arrayContaining([
        "/organization/get-invitation",
        "/organization/invite-member",
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

  it("Better Authの別Reference画面を公開しない", async () => {
    const response = await auth.handler(
      new Request("http://api.localhost/auth/reference")
    )

    expect(response.status).toBe(404)
  })

  it("Better Auth標準OpenAPIを公開する", async () => {
    const response = await auth.handler(
      new Request("http://api.localhost/auth/open-api/generate-schema")
    )
    const schema = await response.json()

    expect(response.status).toBe(200)
    expect(schema).toMatchObject({
      openapi: "3.1.1",
      paths: expect.any(Object),
    })
    expect(Object.keys(schema.paths)).toContain("/organization/invite-member")
  })
})

describe("MCP OAuthプロバイダー", () => {
  it("認可サーバーと保護resourceのmetadataを公開する", async () => {
    const authorizationResponse = await handleMcpOAuthServerMetadata(
      new Request(
        "http://api.localhost/.well-known/oauth-authorization-server/auth"
      )
    )
    const authorizationMetadata = await authorizationResponse.json()
    expect(authorizationResponse.status).toBe(200)
    expect(authorizationMetadata).toMatchObject({
      authorization_endpoint: "http://api.localhost/auth/oauth2/authorize",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer: mcpOAuthIssuer,
      registration_endpoint: "http://api.localhost/auth/oauth2/register",
      revocation_endpoint: "http://api.localhost/auth/oauth2/revoke",
      token_endpoint: "http://api.localhost/auth/oauth2/token",
    })

    await expect(getMcpProtectedResourceMetadata()).resolves.toMatchObject({
      authorization_servers: [mcpOAuthIssuer],
      bearer_methods_supported: ["header"],
      resource: mcpOAuthResource,
      scopes_supported: expect.arrayContaining([
        "account:read",
        "issues:read",
        "issues:create",
        "files:read",
        "files:write",
      ]),
    })
  })

  it("認可とtoken requestにMCP resourceを要求する", async () => {
    const authorize = await auth.handler(
      new Request(
        "http://api.localhost/auth/oauth2/authorize?client_id=client&response_type=code"
      )
    )
    expect(authorize.status).toBe(400)

    const token = await auth.handler(
      new Request("http://api.localhost/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "not-a-token",
          resource: "https://other.example.test/mcp",
        }),
      })
    )
    expect(token.status).toBe(400)
    await expect(token.json()).resolves.toMatchObject({
      code: "MCP_RESOURCE_REQUIRED",
    })
  })

  it("設定済みMCP resourceの重複指定を受理する", async () => {
    const authorizeUrl = new URL(
      "http://api.localhost/auth/oauth2/authorize?client_id=client&response_type=code"
    )
    authorizeUrl.searchParams.append("resource", mcpOAuthResource)
    authorizeUrl.searchParams.append("resource", mcpOAuthResource)

    const response = await auth.handler(new Request(authorizeUrl))

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toContain("error=invalid_client")
  })

  it("設定済みMCP resourceと異なるresourceの混在を拒否する", async () => {
    const authorizeUrl = new URL(
      "http://api.localhost/auth/oauth2/authorize?client_id=client&response_type=code"
    )
    authorizeUrl.searchParams.append("resource", mcpOAuthResource)
    authorizeUrl.searchParams.append(
      "resource",
      "https://other.example.test/mcp"
    )

    const response = await auth.handler(new Request(authorizeUrl))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: "MCP_RESOURCE_REQUIRED",
    })
  })

  it("公開PKCEクライアントをclient secretなしで登録する", async () => {
    const response = await auth.handler(
      new Request("http://api.localhost/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "MCP Test Client",
          application_type: "native",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["http://127.0.0.1/callback"],
          response_types: ["code"],
          scope: "issues:read offline_access",
          token_endpoint_auth_method: "none",
        }),
      })
    )
    const client = await response.json()

    expect(response.status).toBe(201)
    expect(client).toMatchObject({
      client_name: "MCP Test Client",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    })
    expect(client).toHaveProperty("client_id")
    expect(client).not.toHaveProperty("client_secret")
  })
})

describe("verificationの機密情報処理", () => {
  it("verification identifierとmagic-link tokenにhash保存を設定する", () => {
    expect(auth.options.verification?.storeIdentifier).toBe("hashed")
    expect(
      auth.options.plugins?.find((plugin) => plugin.id === "magic-link")
        ?.options
    ).toMatchObject({ storeToken: "hashed" })
  })

  it("送信されたtokenとデータベースエラー引数を記録しない", async () => {
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

describe("組み込みGitHub OAuth境界", () => {
  it("公開経路の認可URLは標準GitHubコールバックを使う", async () => {
    const response = await auth.handler(
      new Request("http://api.localhost/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://app.localhost",
        },
        body: JSON.stringify({
          callbackURL: "http://app.localhost/settings/accounts",
          provider: "github",
        }),
      })
    )
    const result = await response.json()
    const authorizationUrl = new URL(result.url)

    expect(response.status).toBe(200)
    expect(result).toMatchObject({ redirect: true, url: expect.any(String) })
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://api.localhost/auth/callback/github"
    )
  })
})
