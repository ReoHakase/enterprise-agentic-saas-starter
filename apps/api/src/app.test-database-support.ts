import { mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { onTestFinished } from "vitest"

const migrationsFolder = new URL(
  "../../../packages/db/drizzle-v3",
  import.meta.url
).pathname

export const testDb = () => {
  const directory = mkdtempSync(join(tmpdir(), "enterprise-api-test-"))
  const client = createClient({ url: `file:${join(directory, "test.db")}` })
  onTestFinished(async () => {
    client.close()
    await rm(directory, { force: true, recursive: true })
  })
  return drizzle({
    client,
    relations: schema.relations,
  })
}

type TestDb = ReturnType<typeof testDb>

const seedTestRows = async (db: TestDb) => {
  const now = new Date()
  await db.insert(schema.user).values(
    [1, 2, 3, 4, 5].map((number) => ({
      id: `user_${number}`,
      name: `User ${number}`,
      email: `user${number}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }))
  )
  await db.insert(schema.organization).values([
    { id: "org_1", name: "Org One", slug: "org-one", createdAt: now },
    { id: "org_2", name: "Org Two", slug: "org-two", createdAt: now },
  ])
  await db.insert(schema.member).values([
    {
      id: "member_1",
      userId: "user_1",
      organizationId: "org_1",
      role: "owner",
      createdAt: now,
    },
    {
      id: "member_2",
      userId: "user_2",
      organizationId: "org_2",
      role: "owner",
      createdAt: now,
    },
    {
      id: "member_3",
      userId: "user_3",
      organizationId: "org_1",
      role: "admin",
      createdAt: now,
    },
    {
      id: "member_4",
      userId: "user_4",
      organizationId: "org_1",
      role: "member",
      createdAt: now,
    },
    {
      id: "member_5",
      userId: "user_5",
      organizationId: "org_1",
      role: "member",
      createdAt: now,
    },
    {
      id: "member_6",
      userId: "user_5",
      organizationId: "org_2",
      role: "member",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values({
    id: "session_1",
    userId: "user_1",
    token: "token_1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: "org_1",
  })
  await db.insert(schema.agentSessionContexts).values({
    sessionId: "session_1",
    userId: "user_1",
    contextEpoch: 1,
    updatedAt: now,
  })
  await db.insert(schema.issues).values({
    id: "issue_1",
    organizationId: "org_1",
    number: 1,
    title: "Seed issue",
    description: "Tenant-safe seed",
    status: "open",
    priority: "high",
    assigneeId: "user_4",
    creatorId: "user_1",
    labels: ["backend"],
    dueDate: null,
    createdAt: now,
    updatedAt: now,
  })
}

export const createMigratedDb = async () => {
  const db = testDb()
  await migrate(db, { migrationsFolder })
  await db.$client.execute("PRAGMA journal_mode = WAL")
  await db.$client.execute("PRAGMA busy_timeout = 5000")
  return db
}

export const createSeededDb = async () => {
  const db = await createMigratedDb()
  await seedTestRows(db)
  return db
}
