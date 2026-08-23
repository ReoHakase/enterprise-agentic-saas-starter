import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it, vi } from "vitest"

import { putAgentApprovalPolicyForSession } from "./actions/repository"
import {
  closeServer,
  migrationsFolder,
  readRemaining,
  startAgentHost,
  startInternalApiServer,
  stopChild,
} from "./agent.g4-boundary.test-support"
import { createAgentInternalApp } from "./internal-api"
import {
  createAgentThreadForSession,
  prepareAgentChatForSession,
} from "./threads/repository"

vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("APP_NAME", "Agent Web search taint G4")
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

type TestDatabase = ReturnType<typeof drizzle<typeof schema.relations>>

const seedIdentity = async (db: TestDatabase, now: Date) => {
  await db.insert(schema.user).values({
    id: "search-taint-user",
    name: "Search Taint User",
    email: "search-taint@example.test",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.organization).values({
    id: "search-taint-org",
    name: "Search Taint Org",
    slug: "search-taint-org",
    createdAt: now,
  })
  await db.insert(schema.member).values({
    id: "search-taint-member",
    organizationId: "search-taint-org",
    userId: "search-taint-user",
    role: "owner",
    createdAt: now,
  })
  await db.insert(schema.session).values({
    id: "search-taint-session",
    userId: "search-taint-user",
    token: "search-taint-session-token",
    expiresAt: new Date(now.getTime() + 3_600_000),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: "search-taint-org",
  })
}

describe("Agent Web search prompt-injection boundary", () => {
  it("taints the run before an injected write reaches the full-access policy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-search-taint-g4-"))
    const client = createClient({
      url: `file:${join(directory, "application.db")}`,
    })
    const db = drizzle({ client, relations: schema.relations })
    let internalServer:
      | Awaited<ReturnType<typeof startInternalApiServer>>["server"]
      | undefined
    let agentHost:
      | Awaited<ReturnType<typeof startAgentHost>>["child"]
      | undefined

    try {
      await migrate(db, { migrationsFolder })
      await seedIdentity(db, new Date())
      const thread = await createAgentThreadForSession(db, {
        sessionId: "search-taint-session",
        userId: "search-taint-user",
        title: "Search taint",
      })
      await putAgentApprovalPolicyForSession(db, {
        sessionId: "search-taint-session",
        userId: "search-taint-user",
        threadId: thread.id,
        mode: "full_access",
      })
      const messageText = [
        "[G4:WEB_SEARCH_INJECTION] search before writing",
        "Public-only Web query: deterministic security boundary fixture",
      ].join("\n")
      const prepared = await prepareAgentChatForSession(db, {
        assetIds: [],
        contentSegments: [{ text: messageText, type: "text" }],
        messageId: "message_g4_search_taint",
        sessionId: "search-taint-session",
        userId: "search-taint-user",
        threadId: thread.id,
        timezone: "Asia/Tokyo",
      })
      const internal = await startInternalApiServer(createAgentInternalApp(db))
      internalServer = internal.server
      const host = await startAgentHost({
        internalApiUrl: internal.url,
        storageUrl: `file:${join(directory, "agent.db")}`,
      })
      agentHost = host.child

      const response = await fetch(`${host.url}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetIds: [],
          clientMessageId: prepared.clientMessageId,
          contextReferences: [],
          message: prepared.messages[0],
          threadId: thread.id,
          ticket: prepared.ticket,
          timezone: "Asia/Tokyo",
          trigger: "user_message",
        }),
      })
      expect(response.status).toBe(200)
      const reader = response.body?.getReader()
      if (!reader) throw new Error("Search taint response body is unavailable")
      const publicBody = await readRemaining(reader, new TextDecoder())
      expect(publicBody).toContain("UNTRUSTED_PUBLIC_WEB_CONTENT")
      expect(publicBody).toContain("create_issue")
      expect(publicBody).toContain('"requiresApproval":true')
      expect(publicBody).toContain('"status":"pending"')
      expect(publicBody).not.toContain("FORBIDDEN_SEARCH_INJECTED_WRITE")
      expect(publicBody).not.toContain("succeeded")
      await vi.waitFor(async () => {
        expect(
          await fetch(`${host.url}/__g4/metrics`).then((item) => item.json())
        ).toMatchObject({
          finalizeRunCalls: 1,
          prepareCreateIssueCalls: 1,
          releaseCalls: 1,
          startChatRunCalls: 1,
        })
      })

      const [run] = await db
        .select({
          status: schema.agentRuns.status,
          webSearchUsedAt: schema.agentRuns.webSearchUsedAt,
          writeCount: schema.agentRuns.writeCount,
        })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.threadId, thread.id))
      expect(run?.webSearchUsedAt).toBeInstanceOf(Date)
      expect(run).toMatchObject({ status: "waiting_approval", writeCount: 1 })
      expect(
        await db
          .select({
            decisionProvenance: schema.agentActions.decisionProvenance,
            status: schema.agentActions.status,
          })
          .from(schema.agentActions)
      ).toEqual([{ decisionProvenance: null, status: "pending" }])
      expect(await db.select().from(schema.issues)).toEqual([])
      expect(await db.select().from(schema.files)).toEqual([])
      expect(await db.select().from(schema.auditLogs)).toEqual([])
    } finally {
      if (agentHost) await stopChild(agentHost)
      if (internalServer) await closeServer(internalServer)
      client.close()
      vi.unstubAllEnvs()
      await rm(directory, { force: true, recursive: true })
    }
  }, 30_000)
})
