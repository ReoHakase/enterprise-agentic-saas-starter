import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it, vi } from "vitest"

import { createApp } from "../../app"
import { createAgentInternalApp } from "./internal-api"
import { configureAgentRuntime, resetAgentRuntimeForTest } from "./runtime"

vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("APP_NAME", "Agent G4")
  vi.stubEnv("APP_BASE_URL", "http://app.localhost")
  vi.stubEnv("API_PUBLIC_URL", "http://api.localhost")
  vi.stubEnv("CORS_ORIGIN", "http://app.localhost")
  vi.stubEnv("BETTER_AUTH_SECRET", "g4-test-secret-at-least-32-characters")
  vi.stubEnv("BETTER_AUTH_URL", "http://api.localhost")
  vi.stubEnv("AUTH_COOKIE_DOMAIN", "localhost")
  vi.stubEnv("TRUSTED_ORIGINS", "http://app.localhost")
  vi.stubEnv("EMAIL_PROVIDER", "noop")
  vi.stubEnv("EMAIL_FROM", "noreply@example.com")
  vi.stubEnv("GITHUB_CLIENT_ID", "g4-github-client")
  vi.stubEnv("GITHUB_CLIENT_SECRET", "g4-github-secret")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_URL", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_ID", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_SECRET", "")
})

const repositoryRoot = resolve(import.meta.dirname, "../../../../..")
const migrationsFolder = join(repositoryRoot, "packages/db/drizzle")
const inheritedEnvironment = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "LANG", "LC_ALL"].flatMap(
    (name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    }
  )
)

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
  return encodeURIComponent(
    `${value}.${btoa(String.fromCodePoint(...new Uint8Array(signature)))}`
  )
}

const startInternalApiServer = async (
  app: ReturnType<typeof createAgentInternalApp>
): Promise<{ server: Server; url: string }> => {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Uint8Array[] = []
      for await (const chunk of incoming) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      }
      const combinedBody = Buffer.concat(chunks)
      const body =
        combinedBody.length === 0
          ? undefined
          : combinedBody.buffer.slice(
              combinedBody.byteOffset,
              combinedBody.byteOffset + combinedBody.byteLength
            )
      const address = server.address()
      if (!address || typeof address === "string") {
        throw new Error("Internal API server address unavailable")
      }
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) {
          headers.set(name, Array.isArray(value) ? value.join(", ") : value)
        }
      }
      const response = await app.handle(
        new Request(`http://127.0.0.1:${address.port}${incoming.url ?? "/"}`, {
          method: incoming.method,
          headers,
          body,
        })
      )
      outgoing.statusCode = response.status
      response.headers.forEach((value, name) => outgoing.setHeader(name, value))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      outgoing.statusCode = 500
      outgoing.end("Internal test host failure")
    }
  })
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolveListen())
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Internal API server address unavailable")
  }
  return { server, url: `http://127.0.0.1:${address.port}` }
}

const startAgentHost = async ({
  internalApiUrl,
  storageUrl,
}: {
  internalApiUrl: string
  storageUrl: string
}): Promise<{ child: ChildProcess; url: string }> => {
  const child = spawn(
    "/usr/bin/env",
    [
      "-i",
      ...Object.entries(inheritedEnvironment).map(
        ([name, value]) => `${name}=${value}`
      ),
      `AGENT_G4_INTERNAL_API_URL=${internalApiUrl}`,
      `AGENT_G4_STORAGE_URL=${storageUrl}`,
      "bun",
      "--no-env-file",
      "run",
      "scripts/g4-memory-host.ts",
    ],
    {
      cwd: join(repositoryRoot, "apps/agent"),
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  let stdout = ""
  let stderr = ""
  child.stderr?.on("data", (chunk) => {
    stderr += chunk
  })
  return await new Promise((resolveHost, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Agent G4 host start timed out: ${stderr}`))
    }, 10_000)
    child.once("error", (cause) => {
      clearTimeout(timeout)
      reject(cause)
    })
    child.once("exit", (code) => {
      clearTimeout(timeout)
      reject(new Error(`Agent G4 host exited (${code}): ${stderr}`))
    })
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
      const match = stdout.match(/G4_HOST_URL=(http:\/\/[^\s]+)/)
      if (!match?.[1]) return
      clearTimeout(timeout)
      resolveHost({ child, url: match[1] })
    })
  })
}

const closeServer = (server: Server) =>
  new Promise<void>((resolveClose, reject) => {
    server.close((cause) => {
      if (cause) {
        reject(cause)
        return
      }
      resolveClose()
    })
  })

const stopChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return
  const exited = new Promise<void>((resolveExit) =>
    child.once("exit", () => resolveExit())
  )
  child.kill("SIGTERM")
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<false>((resolveTimeout) =>
      setTimeout(() => resolveTimeout(false), 2_000)
    ),
  ])
  if (graceful) return
  child.kill("SIGKILL")
  await exited
}

const readNotFound = async (
  response: Response,
  forbiddenValues: readonly string[]
): Promise<string> => {
  expect(response.status).toBe(404)
  const bodyText = await response.text()
  expect(bodyText.length).toBeLessThan(512)
  for (const value of forbiddenValues) {
    expect(bodyText).not.toContain(value)
  }
  const body: unknown = JSON.parse(bodyText)
  if (
    !body ||
    typeof body !== "object" ||
    !("error" in body) ||
    typeof body.error !== "string"
  ) {
    throw new Error("Public not-found response is invalid")
  }
  return body.error
}

describe("Agent public API to private Memory boundary", () => {
  it("keeps separate durable Memory behind real auth, routes, and Worker boundaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-g4-boundary-"))
    const applicationDatabasePath = join(directory, "application.db")
    const agentDatabasePath = join(directory, "agent.db")
    vi.stubEnv("TURSO_DATABASE_URL", `file:${applicationDatabasePath}`)
    const client = createClient({ url: `file:${applicationDatabasePath}` })
    const db = drizzle(client, { schema })
    let internalServer: Server | undefined
    let agentHost: ChildProcess | undefined

    try {
      await migrate(db, { migrationsFolder })
      const now = new Date()
      const sessionToken = "g4-real-session-token"
      await db.insert(schema.user).values({
        id: "agent-user-a",
        name: "Agent User A",
        email: "agent-a@example.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      await db.insert(schema.organization).values([
        {
          id: "agent-org-a",
          name: "Agent Org A",
          slug: "agent-org-a",
          createdAt: now,
        },
        {
          id: "agent-org-b",
          name: "Agent Org B",
          slug: "agent-org-b",
          createdAt: now,
        },
      ])
      await db.insert(schema.member).values([
        {
          id: "agent-member-a",
          organizationId: "agent-org-a",
          userId: "agent-user-a",
          role: "owner",
          createdAt: now,
        },
        {
          id: "agent-member-b",
          organizationId: "agent-org-b",
          userId: "agent-user-a",
          role: "admin",
          createdAt: now,
        },
      ])
      await db.insert(schema.session).values({
        id: "agent-session-a",
        userId: "agent-user-a",
        token: sessionToken,
        expiresAt: new Date(now.getTime() + 3_600_000),
        createdAt: now,
        updatedAt: now,
        activeOrganizationId: "agent-org-a",
      })

      const internal = await startInternalApiServer(createAgentInternalApp(db))
      internalServer = internal.server
      const host = await startAgentHost({
        internalApiUrl: internal.url,
        storageUrl: `file:${agentDatabasePath}`,
      })
      agentHost = host.child
      configureAgentRuntime({
        fetch(input, init) {
          if (!(input instanceof Request) || init !== undefined) {
            throw new Error("G4 Service Binding requires a Request")
          }
          const request = input
          const url = new URL(request.url)
          return fetch(
            new Request(`${host.url}${url.pathname}${url.search}`, request)
          )
        },
      })
      const [{ auth }, { authPlugin }] = await Promise.all([
        import("@enterprise-agentic-saas/auth"),
        import("../../platform/plugins/auth"),
      ])
      const authContext = await auth.$context
      const signedCookie = await signCookieValue(
        sessionToken,
        authContext.secret
      )
      const sessionCookieName = authContext.authCookies.sessionToken.name
      const publicRequest = (
        pathname: string,
        input: { body?: unknown; method?: string } = {}
      ) =>
        new Request(`http://api.localhost${pathname}`, {
          method: input.method ?? "GET",
          headers: {
            cookie: `${sessionCookieName}=${signedCookie}`,
            "content-type": "application/json",
            origin: "http://app.localhost",
          },
          ...(input.body === undefined
            ? {}
            : { body: JSON.stringify(input.body) }),
        })
      const app = createApp(db).use(authPlugin)
      const initialSession = await app.handle(
        publicRequest("/auth/get-session")
      )
      expect(initialSession.status).toBe(200)
      expect(await initialSession.json()).toMatchObject({
        session: {
          activeOrganizationId: "agent-org-a",
          id: "agent-session-a",
        },
        user: { id: "agent-user-a" },
      })

      const createdResponse = await app.handle(
        publicRequest("/agent/threads", {
          method: "POST",
          body: { permissionMode: "full_access" },
        })
      )
      expect(createdResponse.status).toBe(201)
      const created: unknown = await createdResponse.json()
      if (
        !created ||
        typeof created !== "object" ||
        !("id" in created) ||
        typeof created.id !== "string"
      ) {
        throw new Error("Public Agent thread response is invalid")
      }
      const threadId = created.id
      const privateBoundaryValues = [
        threadId,
        "agent-org-a",
        "agent-org-b",
        "agent-user-a",
        "message_g4_user",
        "Create the deterministic Issue.",
        "Scripted Agent conversation",
        "Scripted Agent cross-worker issue",
      ]
      const chat = await app.handle(
        publicRequest("/agent/chat", {
          method: "POST",
          body: {
            threadId,
            messageId: "message_g4_user",
            contentSegments: [
              { type: "text", text: "Create the deterministic Issue." },
            ],
            assetIds: [],
            timezone: "Asia/Tokyo",
          },
        })
      )
      expect(chat.status).toBe(200)
      expect(await chat.text()).toContain("SCRIPTED_AGENT_OK")

      await vi.waitFor(async () => {
        expect(
          await db
            .select({ status: schema.agentRuns.status })
            .from(schema.agentRuns)
            .where(eq(schema.agentRuns.threadId, threadId))
        ).toEqual([{ status: "completed" }])
      })

      const tickets = await db
        .select({
          consumedAt: schema.agentConnectionTickets.consumedAt,
          revokedAt: schema.agentConnectionTickets.revokedAt,
        })
        .from(schema.agentConnectionTickets)
        .where(eq(schema.agentConnectionTickets.threadId, threadId))
      expect(tickets).toEqual([
        expect.objectContaining({
          consumedAt: expect.any(Date),
          revokedAt: null,
        }),
      ])
      const grants = await db
        .select({
          kind: schema.agentGrants.kind,
          revokedAt: schema.agentGrants.revokedAt,
        })
        .from(schema.agentGrants)
        .where(eq(schema.agentGrants.threadId, threadId))
      expect(grants.map(({ kind }) => kind)).toEqual(
        expect.arrayContaining(["connection", "run"])
      )
      expect(grants.every(({ revokedAt }) => revokedAt instanceof Date)).toBe(
        true
      )
      const usage = await db
        .select({
          inputTokenCount: schema.agentUsageEvents.inputTokenCount,
          outputTokenCount: schema.agentUsageEvents.outputTokenCount,
        })
        .from(schema.agentUsageEvents)
      expect(usage.length).toBeGreaterThan(0)
      expect(
        usage.reduce(
          (total, event) =>
            total + event.inputTokenCount + event.outputTokenCount,
          0
        )
      ).toBeGreaterThan(0)
      expect(
        await db
          .select({ title: schema.issues.title })
          .from(schema.issues)
          .where(eq(schema.issues.organizationId, "agent-org-a"))
      ).toEqual([{ title: "Scripted Agent cross-worker issue" }])

      const listed = await app.handle(publicRequest("/agent/threads"))
      expect(listed.status).toBe(200)
      expect(await listed.json()).toEqual([
        expect.objectContaining({
          id: threadId,
          title: "New conversation",
        }),
      ])
      const history = await app.handle(
        publicRequest(`/agent/threads/${threadId}/messages?page=0&perPage=40`)
      )
      expect(history.status).toBe(200)
      expect(await history.json()).toMatchObject({
        messages: [
          { id: "message_g4_user", role: "user" },
          { role: "assistant" },
        ],
      })

      expect(
        (
          await app.handle(
            publicRequest("/organizations/agent-org-b/activate", {
              method: "POST",
              body: {},
            })
          )
        ).status
      ).toBe(200)
      const organizationBSession = await app.handle(
        publicRequest("/auth/get-session")
      )
      expect(organizationBSession.status).toBe(200)
      expect(await organizationBSession.json()).toMatchObject({
        session: { activeOrganizationId: "agent-org-b" },
        user: { id: "agent-user-a" },
      })
      expect(
        await app
          .handle(publicRequest("/agent/threads"))
          .then((response) => response.json())
      ).toEqual([])
      const crossTenantHistoryError = await readNotFound(
        await app.handle(
          publicRequest(`/agent/threads/${threadId}/messages?page=0&perPage=40`)
        ),
        privateBoundaryValues
      )
      const crossTenantArchiveError = await readNotFound(
        await app.handle(
          publicRequest(`/agent/threads/${threadId}/archive`, {
            method: "POST",
            body: {},
          })
        ),
        privateBoundaryValues
      )
      expect(crossTenantArchiveError).toEqual(crossTenantHistoryError)

      expect(
        (
          await app.handle(
            publicRequest("/organizations/agent-org-a/activate", {
              method: "POST",
              body: {},
            })
          )
        ).status
      ).toBe(200)
      const organizationASession = await app.handle(
        publicRequest("/auth/get-session")
      )
      expect(organizationASession.status).toBe(200)
      expect(await organizationASession.json()).toMatchObject({
        session: { activeOrganizationId: "agent-org-a" },
        user: { id: "agent-user-a" },
      })
      expect(
        (
          await app.handle(
            publicRequest(
              `/agent/threads/${threadId}/messages?page=0&perPage=40`
            )
          )
        ).status
      ).toBe(200)
      expect(
        (
          await app.handle(
            publicRequest(`/agent/threads/${threadId}/archive`, {
              method: "POST",
              body: {},
            })
          )
        ).status
      ).toBe(200)
      expect(
        await app
          .handle(publicRequest("/agent/threads"))
          .then((response) => response.json())
      ).toEqual([])
      expect(
        await readNotFound(
          await app.handle(
            publicRequest(
              `/agent/threads/${threadId}/messages?page=0&perPage=40`
            )
          ),
          privateBoundaryValues
        )
      ).toEqual(crossTenantHistoryError)
      expect(
        await readNotFound(
          await app.handle(
            publicRequest("/agent/chat", {
              method: "POST",
              body: {
                threadId,
                messageId: "message_g4_archived",
                contentSegments: [{ type: "text", text: "Must be denied." }],
                assetIds: [],
                timezone: "Asia/Tokyo",
              },
            })
          ),
          [...privateBoundaryValues, "message_g4_archived", "Must be denied."]
        )
      ).toEqual(crossTenantHistoryError)
      expect(
        await fetch(
          `${host.url}/__g4/inspect?threadId=${encodeURIComponent(threadId)}`
        ).then((response) => response.json())
      ).toEqual({
        messageIds: expect.arrayContaining(["message_g4_user"]),
        threadId,
      })
    } finally {
      resetAgentRuntimeForTest()
      if (agentHost) await stopChild(agentHost)
      if (internalServer) await closeServer(internalServer)
      client.close()
      vi.unstubAllEnvs()
      await rm(directory, { force: true, recursive: true })
    }
  }, 30_000)
})
