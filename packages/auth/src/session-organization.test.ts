import type { Db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { beforeEach, describe, expect, it } from "vitest"

import {
  createSessionOrganizationDatabaseHooks,
  resolveInitialActiveOrganizationId,
} from "./session-organization"

const client = createClient({ url: "file::memory:" })
const database: Db = drizzle(client, { schema })
const { member, session } = schema

const now = new Date("2026-07-14T00:00:00.000Z")

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS session;
    DROP TABLE IF EXISTS member;
    CREATE TABLE member (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE session (
      id TEXT PRIMARY KEY NOT NULL,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL,
      active_organization_id TEXT
    );
  `)
})

const insertMembership = async (id: string, userId: string, orgId: string) => {
  await database.insert(member).values({
    id,
    organizationId: orgId,
    userId,
    role: "member",
    createdAt: now,
  })
}

const insertSession = async (input: {
  id: string
  userId: string
  organizationId: string | null
  updatedAt: Date
  expiresAt?: Date
}) => {
  await database.insert(session).values({
    id: input.id,
    token: `${input.id}-token`,
    userId: input.userId,
    activeOrganizationId: input.organizationId,
    expiresAt: input.expiresAt ?? new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: new Date(input.updatedAt.getTime() - 1000),
    updatedAt: input.updatedAt,
  })
}

describe("new-session organization bootstrap", () => {
  it("preserves the most recent non-expired organization that is still a membership", async () => {
    await insertMembership("member-1", "user-1", "org-1")
    await insertMembership("member-2", "user-1", "org-2")
    await insertSession({
      id: "session-old",
      userId: "user-1",
      organizationId: "org-1",
      updatedAt: new Date(now.getTime() - 2000),
    })
    await insertSession({
      id: "session-new",
      userId: "user-1",
      organizationId: "org-2",
      updatedAt: new Date(now.getTime() - 1000),
    })

    await expect(
      resolveInitialActiveOrganizationId(database, "user-1", now)
    ).resolves.toBe("org-2")
  })

  it("ignores stale and expired session context", async () => {
    await insertMembership("member-1", "user-1", "org-1")
    await insertSession({
      id: "session-stale-membership",
      userId: "user-1",
      organizationId: "org-removed",
      updatedAt: new Date(now.getTime() - 1000),
    })
    await insertSession({
      id: "session-expired",
      userId: "user-1",
      organizationId: "org-1",
      updatedAt: now,
      expiresAt: new Date(now.getTime() - 1),
    })

    await expect(
      resolveInitialActiveOrganizationId(database, "user-1", now)
    ).resolves.toBe("org-1")
  })

  it("requires an explicit choice when multiple memberships have no prior context", async () => {
    await insertMembership("member-1", "user-1", "org-1")
    await insertMembership("member-2", "user-1", "org-2")

    await expect(
      resolveInitialActiveOrganizationId(database, "user-1", now)
    ).resolves.toBeNull()
  })

  it("writes the resolved value into Better Auth session create data", async () => {
    await insertMembership("member-1", "user-1", "org-1")
    const hooks = createSessionOrganizationDatabaseHooks(database)

    await expect(
      hooks.session.create.before({
        id: "new-session",
        userId: "user-1",
        token: "new-token",
      })
    ).resolves.toMatchObject({
      data: {
        id: "new-session",
        userId: "user-1",
        activeOrganizationId: "org-1",
      },
    })
  })
})
