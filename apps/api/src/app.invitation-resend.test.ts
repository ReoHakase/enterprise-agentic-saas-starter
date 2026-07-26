import * as schema from "@enterprise-agentic-saas/db/schema"
import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
  SendEmail,
} from "@enterprise-agentic-saas/email"
import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"

const { invitationEmailRenderSpy, invitationEmailSendSpy } = vi.hoisted(() => ({
  invitationEmailRenderSpy: vi.fn<
    (
      props: OrganizationInvitationEmailProps
    ) => Promise<RenderedEmail<OrganizationInvitationEmailProps>>
  >(async (props) => ({
    template: "organization_invitation",
    subject: "Organization invitation",
    html: "<p>Organization invitation</p>",
    text: "Organization invitation",
    renderProps: props,
  })),
  invitationEmailSendSpy: vi.fn<SendEmail>(async () => undefined),
}))

vi.mock(import("@enterprise-agentic-saas/email"), async (importOriginal) => ({
  ...(await importOriginal()),
  renderOrganizationInvitationEmail: invitationEmailRenderSpy,
}))
vi.mock("@enterprise-agentic-saas/email/runtime", () => ({
  backgroundTaskHandler: undefined,
  createRuntimeEmailSender: () => invitationEmailSendSpy,
}))

beforeEach(() => {
  invitationEmailRenderSpy.mockClear()
  invitationEmailSendSpy.mockReset()
  invitationEmailSendSpy.mockResolvedValue(undefined)
})

describe("organization invitation permissions and resend", () => {
  it("prevents admin invitations from granting admin", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    invitationEmailRenderSpy.mockClear()
    const forbidden = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { emails: ["new@example.test"], role: "admin" },
      })
    )
    expect(forbidden.status).toBe(403)
    expect(await db.select().from(schema.rateLimit)).toHaveLength(0)

    const allowed = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { emails: ["new@example.test"], role: "member" },
      })
    )
    expect(allowed.status).toBe(201)
    const createdBatch = await allowed.json()
    const createdInvitation = createdBatch.invitations[0]
    expect(createdBatch).toMatchObject({
      queuedCount: 1,
      delivery: "queued",
    })
    expect(createdInvitation).toMatchObject({
      inviterId: "user_3",
      inviter: {
        id: "user_3",
        name: "User 3",
        email: "user3@example.test",
        profileImage: null,
      },
    })
    expect(invitationEmailRenderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        inviterName: "User 3",
        organizationName: "Org One",
      })
    )
    expect(invitationEmailRenderSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: "user_3" })
    )

    const duplicate = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { emails: ["new@example.test"], role: "member" },
      })
    )
    expect(duplicate.status).toBe(409)
    const duplicateBody = await duplicate.json()
    expect(duplicateBody).toMatchObject({
      error: {
        code: "conflict",
        context: {
          field: "emails",
          reason: "conflict",
          resource: "invitation",
        },
        fieldErrors: {
          emails: ["One or more emails cannot be invited"],
        },
        message: "One or more emails cannot be invited",
      },
    })
    expect(JSON.stringify(duplicateBody)).not.toContain("new@example.test")

    const existingMember = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { emails: ["user4@example.test"], role: "member" },
      })
    )
    expect(existingMember.status).toBe(409)
    const existingMemberBody = await existingMember.json()
    expect(existingMemberBody).toMatchObject({
      error: {
        code: "conflict",
        context: {
          field: "emails",
          reason: "conflict",
          resource: "invitation",
        },
        fieldErrors: {
          emails: ["One or more emails cannot be invited"],
        },
        message: "One or more emails cannot be invited",
      },
    })
    expect(JSON.stringify(existingMemberBody)).not.toContain(
      "user4@example.test"
    )

    await db.insert(schema.invitation).values({
      id: "expired_invitation",
      organizationId: "org_1",
      email: "expired@example.test",
      role: "member",
      status: "pending",
      expiresAt: new Date(0),
      createdAt: new Date(0),
      inviterId: "user_3",
    })
    await db.insert(schema.invitationEmailJobs).values({
      id: "expired_invitation_job",
      invitationId: "expired_invitation",
      status: "failed",
      attempts: 1,
      nextAttemptAt: new Date(0),
      createdAt: new Date(0),
    })
    const replacement = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { emails: ["expired@example.test"], role: "member" },
      })
    )
    expect(replacement.status).toBe(201)
    const expiredRows = await db
      .select()
      .from(schema.invitation)
      .where(sql`${schema.invitation.id} = 'expired_invitation'`)
    expect(expiredRows[0]?.status).toBe("expired")
    expect(
      await db
        .select({ status: schema.invitationEmailJobs.status })
        .from(schema.invitationEmailJobs)
        .where(eq(schema.invitationEmailJobs.id, "expired_invitation_job"))
    ).toEqual([{ status: "canceled" }])

    const canceled = await app.handle(
      jsonRequest(`/organizations/org_1/invitations/${createdInvitation.id}`, {
        method: "DELETE",
        userId: "user_3",
      })
    )
    expect(canceled.status).toBe(200)
    expect(await canceled.json()).toMatchObject({ status: "canceled" })

    const canceledAgain = await app.handle(
      jsonRequest(`/organizations/org_1/invitations/${createdInvitation.id}`, {
        method: "DELETE",
        userId: "user_3",
      })
    )
    expect(canceledAgain.status).toBe(409)
    expect(await canceledAgain.json()).toMatchObject({
      error: {
        code: "conflict",
        context: { reason: "invitation_not_pending" },
      },
    })
  })

  it("returns member join times and invitation delivery context", async () => {
    const db = await createSeededDb()
    const joinedAt = new Date("2026-01-02T03:04:05.000Z")
    const invitedAt = new Date("2026-02-03T04:05:06.000Z")
    const expiresAt = new Date(Date.now() + 60_000)
    await db
      .update(schema.member)
      .set({ createdAt: joinedAt })
      .where(eq(schema.member.id, "member_4"))
    await db.insert(schema.invitation).values({
      id: "invitation_with_context",
      organizationId: "org_1",
      email: "context@example.test",
      role: "member",
      status: "pending",
      expiresAt,
      createdAt: invitedAt,
      inviterId: "user_3",
    })
    const app = createApp(db)

    const memberResponse = await app.handle(
      jsonRequest("/organizations/org_1/members", { userId: "user_3" })
    )
    const invitationResponse = await app.handle(
      jsonRequest("/organizations/org_1/invitations", { userId: "user_3" })
    )

    expect(memberResponse.status).toBe(200)
    expect(await memberResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "member_4",
          createdAt: joinedAt.toISOString(),
        }),
      ])
    )
    expect(invitationResponse.status).toBe(200)
    expect(await invitationResponse.json()).toEqual([
      expect.objectContaining({
        id: "invitation_with_context",
        createdAt: invitedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        inviterId: "user_3",
        inviter: {
          id: "user_3",
          name: "User 3",
          email: "user3@example.test",
          profileImage: null,
        },
      }),
    ])
  })

  it("resends a pending invitation without replacing its identity or attempts", async () => {
    const db = await createSeededDb()
    const createdAt = new Date("2026-01-01T00:00:00.000Z")
    const jobCreatedAt = new Date("2026-01-01T01:00:00.000Z")
    await db.insert(schema.invitation).values({
      id: "pending_resend",
      organizationId: "org_1",
      email: "pending-resend@example.test",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt,
      inviterId: "user_1",
    })
    await db.insert(schema.invitationEmailJobs).values({
      id: "pending_resend_job",
      invitationId: "pending_resend",
      status: "completed",
      attempts: 3,
      lastErrorCode: "previous_failure",
      createdAt: jobCreatedAt,
      completedAt: new Date(),
    })
    const app = createApp(db)
    const requestedAt = Date.now()

    const response = await app.handle(
      jsonRequest("/organizations/org_1/invitations/pending_resend/resend", {
        method: "POST",
        userId: "user_3",
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      delivery: "queued",
      revived: false,
      invitation: {
        id: "pending_resend",
        status: "pending",
        createdAt: createdAt.toISOString(),
        inviterId: "user_3",
        inviter: {
          id: "user_3",
          name: "User 3",
          email: "user3@example.test",
          profileImage: null,
        },
      },
    })
    expect(new Date(body.invitation.expiresAt).getTime()).toBeGreaterThan(
      requestedAt + 47 * 60 * 60 * 1000
    )
    expect(invitationEmailSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pending-resend@example.test" })
    )

    const storedInvitation = await db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.id, "pending_resend"))
    expect(storedInvitation[0]).toMatchObject({
      id: "pending_resend",
      status: "pending",
      createdAt,
      inviterId: "user_3",
    })
    const storedJob = await db
      .select()
      .from(schema.invitationEmailJobs)
      .where(eq(schema.invitationEmailJobs.id, "pending_resend_job"))
    expect(storedJob[0]).toMatchObject({
      attempts: 4,
      lastErrorCode: null,
      lockedAt: null,
      nextAttemptAt: null,
      createdAt: jobCreatedAt,
      status: "completed",
    })
    expect(storedJob[0]?.completedAt).toBeInstanceOf(Date)
    expect(
      await db
        .select({ action: schema.auditLogs.action })
        .from(schema.auditLogs)
    ).toEqual([{ action: "organization.invitation.resent" }])
    expect(
      (await db.select().from(schema.rateLimit)).map(
        ({ count: value }) => value
      )
    ).toEqual([1, 1])

    const auditResponse = await app.handle(
      jsonRequest("/organizations/org_1/audit-logs?limit=10", {
        userId: "user_3",
      })
    )
    expect(auditResponse.status).toBe(200)
    expect(await auditResponse.json()).toEqual([
      expect.objectContaining({
        action: "organization.invitation.resent",
        metadata: { revived: false, role: "member" },
      }),
    ])
  })

  it("revives stored and effective expiry while creating missing outbox jobs", async () => {
    const db = await createSeededDb()
    const createdAt = new Date("2025-12-01T00:00:00.000Z")
    await db.insert(schema.invitation).values([
      {
        id: "stored_expired_resend",
        organizationId: "org_1",
        email: "stored-expired@example.test",
        role: "member",
        status: "expired",
        expiresAt: new Date(0),
        createdAt,
        inviterId: "user_3",
      },
      {
        id: "effective_expired_resend",
        organizationId: "org_1",
        email: "effective-expired@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(0),
        createdAt,
        inviterId: "user_3",
      },
    ])
    const app = createApp(db)

    for (const invitationId of [
      "stored_expired_resend",
      "effective_expired_resend",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each revival must commit before its durable state is asserted.
      const response = await app.handle(
        jsonRequest(`/organizations/org_1/invitations/${invitationId}/resend`, {
          method: "POST",
          userId: "user_1",
        })
      )
      // oxlint-disable-next-line no-await-in-loop -- response bodies are tied to the sequential revival above.
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        revived: true,
        invitation: {
          id: invitationId,
          status: "pending",
          createdAt: createdAt.toISOString(),
          inviterId: "user_1",
        },
      })
    }

    expect(
      (await db.select().from(schema.invitation)).map((row) => ({
        id: row.id,
        status: row.status,
        inviterId: row.inviterId,
        createdAt: row.createdAt,
      }))
    ).toEqual([
      {
        id: "stored_expired_resend",
        status: "pending",
        inviterId: "user_1",
        createdAt,
      },
      {
        id: "effective_expired_resend",
        status: "pending",
        inviterId: "user_1",
        createdAt,
      },
    ])
    expect(await db.select().from(schema.invitationEmailJobs)).toMatchObject([
      { attempts: 1, status: "completed" },
      { attempts: 1, status: "completed" },
    ])
    expect(invitationEmailSendSpy).toHaveBeenCalledTimes(2)
  })
})
