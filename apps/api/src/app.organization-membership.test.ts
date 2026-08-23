import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"

describe("organization deletion and membership transitions", () => {
  it("deletes a tenant atomically and replays only the exact deletion receipt", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.organization).values({
      id: "org_3",
      name: "Org Three",
      slug: "org-three",
      createdAt: now,
    })
    await db.insert(schema.member).values({
      id: "member_org_3_owner",
      userId: "user_1",
      organizationId: "org_3",
      role: "owner",
      createdAt: now,
    })
    await db.insert(schema.session).values([
      {
        id: "session_org_1_member",
        userId: "user_4",
        token: "token_org_1_member",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
        activeOrganizationId: "org_1",
      },
      {
        id: "session_org_2_owner",
        userId: "user_2",
        token: "token_org_2_owner",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
        activeOrganizationId: "org_2",
      },
    ])
    await db.insert(schema.invitation).values({
      id: "invitation_org_1",
      organizationId: "org_1",
      email: "pending@example.test",
      role: "member",
      status: "pending",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      inviterId: "user_1",
    })
    await db.insert(schema.issueComments).values({
      id: "comment_org_1",
      issueId: "issue_1",
      organizationId: "org_1",
      authorId: "user_1",
      body: "Delete with the tenant",
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.auditLogs).values({
      id: "audit_org_1",
      organizationId: "org_1",
      actorUserId: "user_1",
      action: "organization.test",
      targetType: "organization",
      targetId: "org_1",
      metadata: {},
      createdAt: now,
    })

    const app = createApp(db)
    const body = {
      slug: "org-one",
      confirmation: "DELETE",
      idempotencyKey: "delete_org_1_request_01",
    }
    const first = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_1",
        sessionId: "session_1",
        body,
      })
    )
    expect(first.status).toBe(200)
    const receipt = await first.json()
    expect(receipt).toMatchObject({
      organizationId: "org_1",
      status: "deleted",
    })
    expect(receipt.deletionId).toEqual(expect.any(String))

    const [organizations, members, invitations, issues, comments, audits] =
      await Promise.all([
        db.select().from(schema.organization),
        db.select().from(schema.member),
        db.select().from(schema.invitation),
        db.select().from(schema.issues),
        db.select().from(schema.issueComments),
        db.select().from(schema.auditLogs),
      ])
    expect(organizations.map((item) => item.id)).toEqual(["org_2", "org_3"])
    for (const rows of [members, invitations, issues, comments, audits]) {
      expect(rows.some((item) => item.organizationId === "org_1")).toBe(false)
    }

    const sessions = await db
      .select({
        id: schema.session.id,
        activeOrganizationId: schema.session.activeOrganizationId,
      })
      .from(schema.session)
    expect(
      sessions.find((item) => item.id === "session_1")?.activeOrganizationId
    ).toBeNull()
    expect(
      sessions.find((item) => item.id === "session_org_1_member")
        ?.activeOrganizationId
    ).toBeNull()
    expect(
      sessions.find((item) => item.id === "session_org_2_owner")
        ?.activeOrganizationId
    ).toBe("org_2")

    const jobs = await db.select().from(schema.organizationDeletionJobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      id: receipt.deletionId,
      organizationId: "org_1",
      requestedByUserId: "user_1",
      idempotencyKey: body.idempotencyKey,
      status: "pending",
    })
    expect(JSON.stringify(jobs[0])).not.toContain("org-one")
    expect(JSON.stringify(jobs[0])).not.toContain("@example.test")

    const staleReplay = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_1",
        fresh: false,
        body,
      })
    )
    expect(staleReplay.status).toBe(403)
    expect(await staleReplay.json()).toMatchObject({
      error: "step_up_required",
    })

    const otherActorReplay = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_4",
        body,
      })
    )
    expect(otherActorReplay.status).toBe(404)

    const replay = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_1",
        sessionId: "session_1",
        body,
      })
    )
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual(receipt)

    const wrongKey = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_1",
        body: { ...body, idempotencyKey: "delete_org_1_request_02" },
      })
    )
    expect(wrongKey.status).toBe(404)

    const collision = await app.handle(
      jsonRequest("/organizations/org_3", {
        method: "DELETE",
        userId: "user_1",
        activeOrganizationId: "org_3",
        body: { ...body, slug: "org-three" },
      })
    )
    expect(collision.status).toBe(409)
    expect(await collision.json()).toMatchObject({ error: "conflict" })
    expect(
      await db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.id, "org_3"))
    ).toEqual([{ id: "org_3" }])
    expect(
      await db.select().from(schema.organizationDeletionJobs)
    ).toHaveLength(1)
  })

  it("returns 403 when an admin attempts an owner-only role change", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/organizations/org_1/members/member_4", {
        method: "PATCH",
        userId: "user_3",
        body: { role: "admin" },
      })
    )
    expect(response.status).toBe(403)
  })

  it("returns the stable step-up contract for stale sessions", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/organizations/org_1/members/member_4", {
        method: "PATCH",
        userId: "user_1",
        fresh: false,
        body: { role: "admin" },
      })
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: "step_up_required",
    })
  })

  it("projects linked login methods as booleans without multiplying or leaking member rows", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.account).values([
      {
        id: "github-account-1",
        accountId: "private-github-account-1",
        issuer: "local:oauth:github",
        providerId: "github",
        userId: "user_4",
        accessToken: "private-github-token-1",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "github-account-2",
        accountId: "private-github-account-2",
        issuer: "local:oauth:github",
        providerId: "github",
        userId: "user_4",
        accessToken: "private-github-token-2",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "other-tenant-github-account",
        accountId: "private-other-tenant-account",
        issuer: "local:oauth:github",
        providerId: "github",
        userId: "user_2",
        accessToken: "private-other-tenant-token",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "same-tenant-non-github-account",
        accountId: "user_3",
        issuer: "local:credential",
        providerId: "credential",
        userId: "user_3",
        password: "private-password-hash",
        createdAt: now,
        updatedAt: now,
      },
    ])
    await db.insert(schema.passkey).values([
      {
        id: "passkey-1",
        name: "First key",
        publicKey: "private-public-key-1",
        userId: "user_4",
        credentialID: "private-credential-1",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
        createdAt: now,
      },
      {
        id: "passkey-2",
        name: "Second key",
        publicKey: "private-public-key-2",
        userId: "user_4",
        credentialID: "private-credential-2",
        counter: 0,
        deviceType: "multiDevice",
        backedUp: true,
        createdAt: now,
      },
    ])
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/organizations/org_1/members", {
        userId: "user_4",
      })
    )

    expect(response.status).toBe(200)
    const members = await response.json()
    expect(members).toHaveLength(4)
    expect(
      members.filter((item: { id: string }) => item.id === "member_4")
    ).toHaveLength(1)
    const linkedMember = members.find(
      (item: { id: string }) => item.id === "member_4"
    )
    expect(linkedMember).toMatchObject({
      githubLinked: true,
      passkeyLinked: true,
    })
    for (const privateField of [
      "accountId",
      "accessToken",
      "credentialID",
      "publicKey",
    ]) {
      expect(linkedMember).not.toHaveProperty(privateField)
    }
    expect(
      members.find((item: { id: string }) => item.id === "member_3")
    ).toMatchObject({
      githubLinked: false,
      passkeyLinked: false,
    })
    expect(
      members.some((item: { userId: string }) => item.userId === "user_2")
    ).toBe(false)
    const body = JSON.stringify(members)
    for (const privateValue of [
      "private-github-account",
      "private-github-token",
      "private-public-key",
      "private-credential",
      "private-password",
      "private-other-tenant",
    ]) {
      expect(body).not.toContain(privateValue)
    }
  })

  it("transfers ownership atomically and keeps one owner", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const wrong = await app.handle(
      jsonRequest("/organizations/org_1/ownership-transfer", {
        method: "POST",
        userId: "user_1",
        body: { memberId: "member_4", confirmation: "wrong" },
      })
    )
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({
      error: "confirmation_required",
    })

    const response = await app.handle(
      jsonRequest("/organizations/org_1/ownership-transfer", {
        method: "POST",
        userId: "user_1",
        body: {
          memberId: "member_4",
          confirmation: "user4@example.test",
        },
      })
    )
    expect(response.status).toBe(200)
    const members = await response.json()
    expect(
      members.filter((item: { role: string }) => item.role === "owner")
    ).toHaveLength(1)
    expect(
      members.find((item: { id: string }) => item.id === "member_4").role
    ).toBe("owner")

    const audits = await db.select().from(schema.auditLogs)
    expect(
      audits.some((event) => event.action === "organization.owner.transferred")
    ).toBe(true)
  })

  it("moves removed members' sessions to a valid alternate organization", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.session).values({
      id: "session_user5",
      userId: "user_5",
      token: "token_user5",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "org_1",
    })
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/organizations/org_1/members/member_5", {
        method: "DELETE",
        userId: "user_1",
        body: { confirmation: "user5@example.test" },
      })
    )
    expect(response.status).toBe(200)

    const stored = await db
      .select({ activeOrganizationId: schema.session.activeOrganizationId })
      .from(schema.session)
      .where(eq(schema.session.id, "session_user5"))
    expect(stored[0]?.activeOrganizationId).toBe("org_2")
  })
})
