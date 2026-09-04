import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it, vi } from "vitest"

import {
  closeServer,
  migrationsFolder,
  readRemaining,
  readThrough,
  startAgentHost,
  startInternalApiServer,
  stopChild,
} from "./agent.g4-boundary.test-support"
import { revokeAgentSessionContextInTransaction } from "./context/repository"
import { createAgentInternalApp } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("APP_NAME", "Agent revocation G4")
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
    id: "revocation-user",
    name: "Revocation User",
    email: "revocation@example.test",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.organization).values({
    id: "revocation-org",
    name: "Revocation Org",
    slug: "revocation-org",
    createdAt: now,
  })
  await db.insert(schema.member).values({
    id: "revocation-member",
    organizationId: "revocation-org",
    userId: "revocation-user",
    role: "owner",
    createdAt: now,
  })
  await db.insert(schema.session).values({
    id: "revocation-session",
    userId: "revocation-user",
    token: "revocation-session-token",
    expiresAt: new Date(now.getTime() + 3_600_000),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: "revocation-org",
  })
}

const chatRequest = (
  hostUrl: string,
  threadId: string,
  ticket: string,
  toolRace: boolean
) => {
  const messageId = toolRace
    ? "message_g4_revocation_tool"
    : "message_g4_revocation"
  return fetch(`${hostUrl}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      assetIds: [],
      clientMessageId: messageId,
      contextReferences: [],
      message: {
        id: messageId,
        parts: [
          {
            type: "text",
            text: toolRace
              ? "[G4:REVOKE_AFTER_TOOL] external revocation"
              : "[G4:REVOKE] external revocation",
          },
        ],
        role: "user",
      },
      threadId,
      ticket,
      timezone: "Asia/Tokyo",
      trigger: "user_message",
    }),
  })
}

const readProductModelCalls = async (
  hostUrl: string
): Promise<{ count: number; prompts: string[] }> => {
  const value: unknown = await fetch(`${hostUrl}/__g4/model-calls`).then(
    (item) => item.json()
  )
  if (
    typeof value !== "object" ||
    value === null ||
    !("count" in value) ||
    typeof value.count !== "number" ||
    !("prompts" in value) ||
    !Array.isArray(value.prompts) ||
    !value.prompts.every((prompt) => typeof prompt === "string")
  ) {
    throw new Error("Invalid G4 model-call evidence")
  }
  return { count: value.count, prompts: value.prompts }
}

describe("Agent外部失効のliveness", () => {
  it.each([
    { hostOutcome: "survive", label: "hostを維持した場合" },
    { hostOutcome: "restart", label: "hostを再起動した場合" },
    {
      hostOutcome: "tool-race",
      label: "tool実行と失効が競合した場合",
    },
  ] as const)(
    "$labelでも失効済みcontinuationを阻止してMemoryを空に保つ",
    async ({ hostOutcome }) => {
      const directory = await mkdtemp(join(tmpdir(), "agent-revocation-g4-"))
      const applicationPath = join(directory, "application.db")
      const agentPath = join(directory, "agent.db")
      const client = createClient({ url: `file:${applicationPath}` })
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
          sessionId: "revocation-session",
          userId: "revocation-user",
          title: "New conversation",
        })
        const connection = await issueAgentConnectionTicket(db, {
          sessionId: "revocation-session",
          userId: "revocation-user",
          threadId: thread.id,
        })
        const internal = await startInternalApiServer(
          createAgentInternalApp(db)
        )
        internalServer = internal.server
        const host = await startAgentHost({
          internalApiUrl: internal.url,
          storageUrl: `file:${agentPath}`,
        })
        agentHost = host.child

        const response = await chatRequest(
          host.url,
          thread.id,
          connection.ticket,
          hostOutcome === "tool-race"
        )
        expect(response.status).toBe(200)
        const reader = response.body?.getReader()
        if (!reader) throw new Error("Revocation response body is unavailable")
        const before =
          hostOutcome === "tool-race"
            ? {
                body: "",
                decoder: new TextDecoder(),
                toolCommitStatus: await fetch(
                  `${host.url}/__g4/wait-tool-commit`
                ).then(({ status }) => status),
              }
            : await readThrough(reader, "BEFORE_REVOKE")

        await db.transaction((tx) =>
          revokeAgentSessionContextInTransaction(tx, {
            sessionId: "revocation-session",
            userId: "revocation-user",
          })
        )
        expect(
          "toolCommitStatus" in before ? before.toolCommitStatus : 200
        ).toBe(200)
        expect(
          await fetch(
            hostOutcome === "tool-race"
              ? `${host.url}/__g4/release-tool-commit`
              : `${host.url}/__g4/release-revocation`,
            {
              method: "POST",
            }
          ).then(({ status }) => status)
        ).toBe(200)
        const publicBody =
          before.body + (await readRemaining(reader, before.decoder))
        expect(publicBody.includes("BEFORE_REVOKE")).toBe(
          hostOutcome !== "tool-race"
        )
        expect(publicBody.includes("AFTER_REVOKE")).toBe(
          hostOutcome !== "tool-race"
        )
        expect(publicBody).not.toContain("Scripted Agent conversation")
        const providerCalls = await readProductModelCalls(host.url)
        expect({
          count: providerCalls.count,
          containsToolResult: providerCalls.prompts.some((prompt) =>
            prompt.includes('"type":"tool-result"')
          ),
        }).toEqual({ count: 1, containsToolResult: false })

        let survivalEvidence: unknown = null
        if (hostOutcome === "survive") {
          await vi.waitUntil(async () => {
            survivalEvidence = {
              metrics: await fetch(`${host.url}/__g4/metrics`).then((item) =>
                item.json()
              ),
              runs: await db
                .select({ status: schema.agentRuns.status })
                .from(schema.agentRuns)
                .where(eq(schema.agentRuns.threadId, thread.id)),
            }
            return (
              JSON.stringify(survivalEvidence) ===
              JSON.stringify({
                metrics: {
                  assertRunLiveCalls: 2,
                  finalizeRunCalls: 1,
                  livenessRejections: 1,
                  prepareCreateIssueCalls: 0,
                  releaseCalls: 1,
                  startChatRunCalls: 1,
                },
                runs: [{ status: "canceled" }],
              })
            )
          })
        } else if (hostOutcome === "restart") {
          await stopChild(host.child)
          agentHost = undefined
          const reopened = await startAgentHost({
            internalApiUrl: internal.url,
            storageUrl: `file:${agentPath}`,
          })
          agentHost = reopened.child
          host.child = reopened.child
          host.url = reopened.url
        }
        expect(survivalEvidence).toEqual(
          hostOutcome === "survive"
            ? {
                metrics: {
                  assertRunLiveCalls: 2,
                  finalizeRunCalls: 1,
                  livenessRejections: 1,
                  prepareCreateIssueCalls: 0,
                  releaseCalls: 1,
                  startChatRunCalls: 1,
                },
                runs: [{ status: "canceled" }],
              }
            : null
        )
        const actions = await db
          .select({ status: schema.agentActions.status })
          .from(schema.agentActions)
        expect(actions).toEqual(
          hostOutcome === "tool-race" ? [{ status: "canceled" }] : []
        )
        expect(await db.select().from(schema.issues)).toEqual([])

        const historyTicket = await issueAgentConnectionTicket(db, {
          sessionId: "revocation-session",
          userId: "revocation-user",
          threadId: thread.id,
        })
        const history = await fetch(`${host.url}/memory/history`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: 0,
            perPage: 40,
            threadId: thread.id,
            ticket: historyTicket.ticket,
          }),
        })
        expect(history.status).toBe(200)
        const historyBody: {
          messages: Array<{ id: string; role: string }>
        } = await history.json()
        const historyText = JSON.stringify(historyBody)
        expect(historyText).toContain(
          hostOutcome === "tool-race"
            ? "message_g4_revocation_tool"
            : "message_g4_revocation"
        )
        expect(historyText).toContain('"role":"user"')
        expect(historyBody.messages.map(({ role }) => role)).toEqual(
          hostOutcome === "tool-race" ? ["user", "assistant"] : ["user"]
        )
        for (const forbidden of [
          "BEFORE_REVOKE",
          "AFTER_REVOKE",
          "data-run",
          "g4-revoked-tool-call",
          "FORBIDDEN_REVOKED_WRITE",
          "FORBIDDEN_REVOKED_SOURCE",
        ]) {
          expect(historyText).not.toContain(forbidden)
        }
        const inspected: {
          messages: Array<{ id: string; role: string }>
          threadId: string
          title: string
        } = await fetch(
          `${host.url}/__g4/inspect-revocation?threadId=${encodeURIComponent(thread.id)}`
        ).then((item) => item.json())
        expect(inspected).toMatchObject({
          threadId: thread.id,
          title: "",
        })
        expect(
          inspected.messages.map(({ id, role }) => ({
            id: role === "assistant" ? "generated" : id,
            role,
          }))
        ).toEqual(
          hostOutcome === "tool-race"
            ? [
                { id: "message_g4_revocation_tool", role: "user" },
                { id: "generated", role: "assistant" },
              ]
            : [{ id: "message_g4_revocation", role: "user" }]
        )
      } finally {
        if (agentHost) await stopChild(agentHost)
        if (internalServer) await closeServer(internalServer)
        client.close()
        vi.unstubAllEnvs()
        await rm(directory, { force: true, recursive: true })
      }
    },
    30_000
  )
})
