import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { findOrganizationForUser } from "./repository"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
  import.meta.url
).pathname

describe("organization repository", () => {
  it("counts only unexpired pending invitations", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle(client, { schema })

    try {
      await migrate(db, { migrationsFolder })
      const now = new Date()
      await db.insert(schema.user).values({
        id: "user-1",
        name: "Owner",
        email: "owner@example.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      await db.insert(schema.organization).values({
        id: "organization-1",
        name: "Organization",
        slug: "organization",
        createdAt: now,
      })
      await db.insert(schema.member).values({
        id: "member-1",
        organizationId: "organization-1",
        userId: "user-1",
        role: "owner",
        createdAt: now,
      })
      await db.insert(schema.invitation).values([
        {
          id: "expired-pending",
          organizationId: "organization-1",
          email: "expired@example.test",
          role: "member",
          status: "pending",
          expiresAt: new Date(now.getTime() - 1),
          createdAt: now,
          inviterId: "user-1",
        },
        {
          id: "active-pending",
          organizationId: "organization-1",
          email: "active@example.test",
          role: "member",
          status: "pending",
          expiresAt: new Date(now.getTime() + 60_000),
          createdAt: now,
          inviterId: "user-1",
        },
        {
          id: "accepted",
          organizationId: "organization-1",
          email: "accepted@example.test",
          role: "member",
          status: "accepted",
          expiresAt: new Date(now.getTime() + 60_000),
          createdAt: now,
          inviterId: "user-1",
        },
      ])

      const organization = await findOrganizationForUser(db, {
        activeOrganizationId: "organization-1",
        organizationId: "organization-1",
        userId: "user-1",
      })

      expect(organization).toMatchObject({
        id: "organization-1",
        invitationCount: 1,
      })
    } finally {
      client.close()
    }
  })
})
