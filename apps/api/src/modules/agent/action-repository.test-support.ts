import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach } from "vitest"

import { createApp } from "../../app"
import { env } from "../../platform/env"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
  prepareAgentChatForSession,
} from "./threads/repository"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle-v3",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    databasePaths.splice(0).map((path) => rm(path, { force: true }))
  )
})

export const createFixture = async () => {
  const databasePath = join(
    tmpdir(),
    `enterprise-agent-action-${crypto.randomUUID()}.db`
  )
  databasePaths.push(databasePath)
  const client = createClient({ url: `file:${databasePath}` })
  clients.push(client)
  const db = drizzle({ client, relations: schema.relations })
  await migrate(db, { migrationsFolder })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 3_600_000)
  await db.insert(schema.user).values([
    {
      id: "action-user-a",
      name: "Action User A",
      email: "action-a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "action-user-b",
      name: "Action User B",
      email: "action-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(schema.organization).values([
    {
      id: "action-org-a",
      name: "Action Org A",
      slug: "action-org-a",
      createdAt: now,
    },
    {
      id: "action-org-b",
      name: "Action Org B",
      slug: "action-org-b",
      createdAt: now,
    },
  ])
  await db.insert(schema.member).values([
    {
      id: "action-member-a",
      organizationId: "action-org-a",
      userId: "action-user-a",
      role: "owner",
      createdAt: now,
    },
    {
      id: "action-member-b",
      organizationId: "action-org-a",
      userId: "action-user-b",
      role: "member",
      createdAt: now,
    },
    {
      id: "action-member-other",
      organizationId: "action-org-b",
      userId: "action-user-a",
      role: "owner",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values([
    {
      id: "action-session-a",
      userId: "action-user-a",
      token: "action-token-a",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-a",
    },
    {
      id: "action-session-b",
      userId: "action-user-b",
      token: "action-token-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-a",
    },
  ])
  await db.insert(schema.issues).values([
    {
      id: "action-issue-a",
      organizationId: "action-org-a",
      number: 1,
      title: "Original title",
      description: "Original description",
      status: "open",
      priority: "medium",
      assigneeId: "action-user-b",
      creatorId: "action-user-a",
      labels: ["Backend"],
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "action-issue-other",
      organizationId: "action-org-b",
      number: 1,
      title: "Other tenant",
      description: "Not visible",
      status: "open",
      priority: "urgent",
      creatorId: "action-user-a",
      labels: [],
      createdAt: now,
      updatedAt: now,
    },
  ])
  return { app: createApp(db), client, db }
}

const requestHeaders = (
  userId = "action-user-a",
  sessionId = "action-session-a",
  activeOrganizationId = "action-org-a",
  requestId?: string
) => ({
  "content-type": "application/json",
  ...(requestId === undefined ? {} : { "x-request-id": requestId }),
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
    requestId?: string
  } = {}
) =>
  new Request(`http://localhost${path}`, {
    method: input.method ?? "GET",
    headers: requestHeaders(
      input.userId,
      input.sessionId,
      input.activeOrganizationId,
      input.requestId
    ),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

export const createRun = async (
  db: Awaited<ReturnType<typeof createFixture>>["db"],
  input: {
    clientMessageId: string
    userId?: string
    sessionId?: string
    webSearchQuery?: string
  }
) => {
  const userId = input.userId ?? "action-user-a"
  const sessionId = input.sessionId ?? "action-session-a"
  const thread = await createAgentThreadForSession(db, {
    sessionId,
    userId,
    title: `Action ${input.clientMessageId}`,
  })
  const ticket = input.webSearchQuery
    ? await prepareAgentChatForSession(db, {
        assetIds: [],
        contentSegments: [
          {
            text: `Public-only Web query: ${input.webSearchQuery}`,
            type: "text",
          },
        ],
        messageId: input.clientMessageId,
        sessionId,
        threadId: thread.id,
        timezone: "Asia/Tokyo",
        userId,
      })
    : await issueAgentConnectionTicket(db, {
        sessionId,
        userId,
        threadId: thread.id,
      })
  const internal = createAgentInternalApi(db)
  const chatRun = await internal.startChatRun({
    clientMessageId: input.clientMessageId,
    ticket: ticket.ticket,
    threadId: thread.id,
  })
  return { chatRun, internal, run: chatRun.run, thread, ticket }
}
