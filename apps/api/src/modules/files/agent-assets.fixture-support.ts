import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach } from "vitest"

import { createApp } from "../../app"
import { resetFileStorageRuntimeForTest } from "./runtime"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

afterEach(async () => {
  resetFileStorageRuntimeForTest()
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    databasePaths.splice(0).map((path) => rm(path, { force: true }))
  )
})

export const createFixture = async () => {
  const databasePath = join(
    tmpdir(),
    `enterprise-agent-assets-${crypto.randomUUID()}.db`
  )
  databasePaths.push(databasePath)
  const client = createClient({ url: `file:${databasePath}` })
  clients.push(client)
  const db: Db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  await db.insert(schema.user).values([
    {
      id: "asset-user-a",
      name: "Asset User A",
      email: "asset-a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asset-user-b",
      name: "Asset User B",
      email: "asset-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(schema.organization).values([
    {
      id: "asset-org-a",
      name: "Asset Org A",
      slug: "asset-org-a",
      createdAt: now,
    },
    {
      id: "asset-org-b",
      name: "Asset Org B",
      slug: "asset-org-b",
      createdAt: now,
    },
  ])
  await db.insert(schema.member).values([
    {
      id: "asset-member-a-a",
      organizationId: "asset-org-a",
      userId: "asset-user-a",
      role: "owner",
      createdAt: now,
    },
    {
      id: "asset-member-a-b",
      organizationId: "asset-org-a",
      userId: "asset-user-b",
      role: "member",
      createdAt: now,
    },
    {
      id: "asset-member-b-a",
      organizationId: "asset-org-b",
      userId: "asset-user-a",
      role: "owner",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values([
    {
      id: "asset-session-a",
      userId: "asset-user-a",
      token: "asset-token-a",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "asset-org-a",
    },
    {
      id: "asset-session-b",
      userId: "asset-user-b",
      token: "asset-token-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "asset-org-a",
    },
    {
      id: "asset-session-a-org-b",
      userId: "asset-user-a",
      token: "asset-token-a-org-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "asset-org-b",
    },
  ])
  await db.insert(schema.agentThreads).values([
    {
      id: "asset-thread-a",
      organizationId: "asset-org-a",
      ownerUserId: "asset-user-a",
      createdAt: now,
    },
    {
      id: "asset-thread-other-owner",
      organizationId: "asset-org-a",
      ownerUserId: "asset-user-b",
      createdAt: now,
    },
    {
      id: "asset-thread-b",
      organizationId: "asset-org-b",
      ownerUserId: "asset-user-a",
      createdAt: now,
    },
  ])

  return { app: createApp(db), db, now }
}

const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

export const pngBytes = (size = 16, variant = 0) => {
  const bytes = new Uint8Array(size)
  bytes.set(pngSignature)
  bytes[bytes.byteLength - 1] = variant
  return bytes
}

export const pngFile = (
  name = "agent-image.png",
  options: { size?: number; type?: string; variant?: number } = {}
) =>
  new File([pngBytes(options.size, options.variant)], name, {
    type: options.type ?? "image/png",
  })
