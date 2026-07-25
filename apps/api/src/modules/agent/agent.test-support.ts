import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach } from "vitest"

import { createApp } from "../../app"
import { env } from "../../env"
import {
  configureAgentRuntime,
  resetAgentRuntimeForTest,
  type AgentRuntimeBinding,
} from "./runtime"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

afterEach(async () => {
  resetAgentRuntimeForTest()
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    databasePaths.splice(0).map((path) => rm(path, { force: true }))
  )
})

export const createFixture = async () => {
  const databasePath = join(
    tmpdir(),
    `enterprise-agent-api-${crypto.randomUUID()}.db`
  )
  databasePaths.push(databasePath)
  const client = createClient({ url: `file:${databasePath}` })
  clients.push(client)
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 3_600_000)
  await db.insert(schema.user).values([
    {
      id: "agent-user-a",
      name: "Agent User A",
      email: "agent-a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "agent-user-b",
      name: "Agent User B",
      email: "agent-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
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
      id: "agent-member-a-1",
      organizationId: "agent-org-a",
      userId: "agent-user-a",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "agent-member-a-2",
      organizationId: "agent-org-a",
      userId: "agent-user-b",
      role: "member",
      createdAt: now,
    },
    {
      id: "agent-member-b-1",
      organizationId: "agent-org-b",
      userId: "agent-user-a",
      role: "admin",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values([
    {
      id: "agent-session-a",
      userId: "agent-user-a",
      token: "agent-token-a",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "agent-org-a",
    },
    {
      id: "agent-session-b",
      userId: "agent-user-b",
      token: "agent-token-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "agent-org-a",
    },
  ])
  await db.insert(schema.issues).values([
    {
      id: "agent-issue-a",
      organizationId: "agent-org-a",
      number: 1,
      title: "Fix API boundary",
      description: "Keep the tenant projection minimal",
      status: "open",
      priority: "high",
      assigneeId: "agent-user-b",
      creatorId: "agent-user-a",
      labels: ["Backend", "Security"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "agent-issue-b",
      organizationId: "agent-org-b",
      number: 1,
      title: "Other tenant issue",
      description: "Must not be visible",
      status: "open",
      priority: "urgent",
      creatorId: "agent-user-a",
      labels: ["Secret"],
      createdAt: now,
      updatedAt: now,
    },
  ])

  return { app: createApp(db), db }
}

export const headers = (
  userId = "agent-user-a",
  sessionId = "agent-session-a",
  activeOrganizationId = "agent-org-a"
) => ({
  "content-type": "application/json",
  "x-test-user-id": userId,
  "x-test-session-id": sessionId,
  "x-test-active-organization-id": activeOrganizationId,
  "x-test-session-created-at": new Date().toISOString(),
  origin: env.CORS_ORIGIN[0] ?? env.API_PUBLIC_URL,
})

export const request = (
  path: string,
  input: {
    body?: unknown
    method?: string
    userId?: string
    sessionId?: string
    activeOrganizationId?: string
  } = {}
) =>
  new Request(`http://localhost${path}`, {
    method: input.method ?? "GET",
    headers: headers(input.userId, input.sessionId, input.activeOrganizationId),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

export const configureAgentStreamCapture = () => {
  const inputs: Record<string, unknown>[] = []
  const binding: AgentRuntimeBinding = {
    async fetch(input, init) {
      const privateRequest =
        input instanceof Request ? input : new Request(input, init)
      const payload: unknown = await privateRequest.json()
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Invalid private Agent test request")
      }
      inputs.push(Object.fromEntries(Object.entries(payload)))
      return new Response("data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      })
    },
  }
  configureAgentRuntime(binding)
  return inputs
}
