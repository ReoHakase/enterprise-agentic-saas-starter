import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { listInvitationsByOrganization } from "./invitation-repository"
import { findOrganizationForUser } from "./repository"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
  import.meta.url
).pathname

describe("organization repository", () => {
  it("counts active invitations and omits invalid legacy rows from listings", async () => {
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
        {
          id: "legacy-owner",
          organizationId: "organization-1",
          email: "legacy-owner@example.test",
          role: "owner",
          status: "expired",
          expiresAt: now,
          createdAt: now,
          inviterId: "user-1",
        },
        {
          id: "legacy-null",
          organizationId: "organization-1",
          email: "legacy-null@example.test",
          role: null,
          status: "expired",
          expiresAt: now,
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

      const invitations = await listInvitationsByOrganization(
        db,
        "organization-1"
      )
      expect(invitations).toHaveLength(4)
      expect(invitations.map(({ id }) => id)).toEqual(
        expect.arrayContaining([
          "expired-pending",
          "active-pending",
          "accepted",
          "legacy-null",
        ])
      )
      const expired = invitations.find(({ id }) => id === "expired-pending")
      expect(expired).toMatchObject({
        id: "expired-pending",
        role: "member",
        status: "expired",
        inviter: {
          id: "user-1",
          profileImage: null,
        },
      })
      expect(expired?.createdAt).toBe(now.toISOString())
      expect(invitations.find(({ id }) => id === "legacy-null")).toMatchObject({
        role: "member",
        status: "expired",
      })
    } finally {
      client.close()
    }
  })
})
