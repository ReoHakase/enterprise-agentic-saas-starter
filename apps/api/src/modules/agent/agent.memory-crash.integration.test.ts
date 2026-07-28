import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import {
  closeServer,
  crashChild,
  migrationsFolder,
  startAgentHost,
  startInternalApiServer,
  stopChild,
} from "./agent.g4-boundary.test-support"
import { hashAgentToken } from "./crypto"
import { createAgentInternalApp } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>

const seedIdentity = async (db: TestDatabase, now: Date) => {
  await db.insert(schema.user).values({
    id: "memory-crash-user",
    name: "Memory Crash User",
    email: "memory-crash@example.test",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.organization).values({
    id: "memory-crash-org",
    name: "Memory Crash Org",
    slug: "memory-crash-org",
    createdAt: now,
  })
  await db.insert(schema.member).values({
    id: "memory-crash-member",
    organizationId: "memory-crash-org",
    userId: "memory-crash-user",
    role: "super_admin",
    createdAt: now,
  })
  await db.insert(schema.session).values({
    id: "memory-crash-session",
    userId: "memory-crash-user",
    token: "memory-crash-session-token",
    expiresAt: new Date(now.getTime() + 3_600_000),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: "memory-crash-org",
  })
}

const issueTicket = (db: TestDatabase, threadId: string) =>
  issueAgentConnectionTicket(db, {
    sessionId: "memory-crash-session",
    userId: "memory-crash-user",
    threadId,
  })

const requestHistory = async (
  db: TestDatabase,
  hostUrl: string,
  threadId: string
) => {
  const { ticket } = await issueTicket(db, threadId)
  return {
    response: await fetch(`${hostUrl}/memory/history`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: 0, perPage: 40, threadId, ticket }),
    }),
    ticket,
  }
}

const requestChat = (
  hostUrl: string,
  threadId: string,
  ticket: string,
  messageId: string
) =>
  fetch(`${hostUrl}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      assetIds: [],
      clientMessageId: messageId,
      contextReferences: [],
      message: {
        id: messageId,
        parts: [{ type: "text", text: "Create the deterministic Issue." }],
        role: "user",
      },
      threadId,
      ticket,
      timezone: "Asia/Tokyo",
      trigger: "user_message",
    }),
  })

const readOptional = async (path: string) => {
  try {
    return await readFile(path)
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return Buffer.alloc(0)
    }
    throw cause
  }
}

const readAgentStorage = async (databasePath: string) =>
  Buffer.concat(
    await Promise.all(
      [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map(
        readOptional
      )
    )
  ).toString("utf8")

describe("Agent Memory commit process-crash recovery", () => {
  it.each([
    "before-memory-save",
    "after-memory-save",
    "after-run-settlement",
  ] as const)(
    "recovers exactly once after SIGKILL at %s",
    async (crashWindow) => {
      const directory = await mkdtemp(join(tmpdir(), "agent-memory-crash-g4-"))
      const applicationPath = join(directory, "application.db")
      const agentPath = join(directory, "agent.db")
      const client = createClient({ url: `file:${applicationPath}` })
      const db = drizzle(client, { schema })
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
          permissionMode: "full_access",
          sessionId: "memory-crash-session",
          userId: "memory-crash-user",
          title: "New conversation",
        })
        const connection = await issueTicket(db, thread.id)
        const internal = await startInternalApiServer(
          createAgentInternalApp(db)
        )
        internalServer = internal.server
        const first = await startAgentHost({
          crashWindow,
          internalApiUrl: internal.url,
          storageUrl: `file:${agentPath}`,
        })
        agentHost = first.child

        const chat = await requestChat(
          first.url,
          thread.id,
          connection.ticket,
          `message_${crashWindow.replaceAll("-", "_")}`
        )
        expect(chat.status).toBe(200)
        const interruptedBody = chat.text().catch(() => "")
        expect(
          await fetch(`${first.url}/__g4/wait-crash`).then(
            ({ status }) => status
          )
        ).toBe(200)
        const blockedHistory = await requestHistory(db, first.url, thread.id)
        expect(blockedHistory.response.status).toBe(503)

        await crashChild(first.child)
        await interruptedBody
        agentHost = undefined
        const recovered = await startAgentHost({
          internalApiUrl: internal.url,
          storageUrl: `file:${agentPath}`,
        })
        agentHost = recovered.child
        const firstRecoveredHistory = await requestHistory(
          db,
          recovered.url,
          thread.id
        )
        expect([200, 503]).toContain(firstRecoveredHistory.response.status)
        const firstRecoveredBody = await firstRecoveredHistory.response.text()
        expect(
          firstRecoveredHistory.response.status === 503 ||
            firstRecoveredBody.includes('"role":"assistant"')
        ).toBe(true)
        expect(
          await fetch(`${recovered.url}/__g4/drain`, {
            method: "POST",
          }).then(({ status }) => status)
        ).toBe(200)

        const history = await requestHistory(db, recovered.url, thread.id)
        expect(history.response.status).toBe(200)
        const historyBody: unknown = await history.response.json()
        if (
          !historyBody ||
          typeof historyBody !== "object" ||
          !("messages" in historyBody) ||
          !Array.isArray(historyBody.messages)
        ) {
          throw new Error("Recovered Memory history is invalid")
        }
        expect(
          historyBody.messages.filter(({ role }) => role === "user")
        ).toHaveLength(1)
        expect(
          historyBody.messages.filter(({ role }) => role === "assistant")
        ).toHaveLength(1)
        expect(new Set(historyBody.messages.map(({ id }) => id)).size).toBe(2)

        expect(
          await db.select({ title: schema.issues.title }).from(schema.issues)
        ).toEqual([{ title: "Scripted Agent cross-worker issue" }])
        expect(await db.select().from(schema.agentUsageEvents)).toHaveLength(1)
        expect(
          await db
            .select({ status: schema.agentRuns.status })
            .from(schema.agentRuns)
            .where(eq(schema.agentRuns.threadId, thread.id))
        ).toEqual([{ status: "completed" }])
        const grants = await db
          .select({
            grant: schema.agentGrants.tokenHash,
            kind: schema.agentGrants.kind,
            revokedAt: schema.agentGrants.revokedAt,
          })
          .from(schema.agentGrants)
          .where(eq(schema.agentGrants.threadId, thread.id))
        expect(
          grants
            .filter(({ kind }) => kind === "run")
            .every(({ revokedAt }) => revokedAt instanceof Date)
        ).toBe(true)
        const connectionTickets = await db
          .select({
            consumedAt: schema.agentConnectionTickets.consumedAt,
            tokenHash: schema.agentConnectionTickets.tokenHash,
          })
          .from(schema.agentConnectionTickets)
          .where(eq(schema.agentConnectionTickets.threadId, thread.id))
        const blockedHistoryTicketHash = await hashAgentToken(
          blockedHistory.ticket
        )
        const recoveredHistoryTicketHash = await hashAgentToken(history.ticket)
        expect(
          connectionTickets.find(
            ({ tokenHash }) => tokenHash === blockedHistoryTicketHash
          )?.consumedAt
        ).toBeNull()
        expect(
          connectionTickets.find(
            ({ tokenHash }) => tokenHash === recoveredHistoryTicketHash
          )?.consumedAt
        ).toBeInstanceOf(Date)
        expect(
          (
            await fetch(`${recovered.url}/memory/history`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                page: 0,
                perPage: 40,
                threadId: thread.id,
                ticket: connection.ticket,
              }),
            })
          ).status
        ).toBe(503)
        const rawAgentStorage = await readAgentStorage(agentPath)
        expect(rawAgentStorage).not.toContain(connection.ticket)
        for (const { grant } of grants) {
          expect(rawAgentStorage).not.toContain(grant)
        }
      } finally {
        if (agentHost) await stopChild(agentHost)
        if (internalServer) await closeServer(internalServer)
        client.close()
        await rm(directory, { force: true, recursive: true })
      }
    },
    45_000
  )
})
