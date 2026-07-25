import * as schema from "@enterprise-agentic-saas/db/schema"
import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
  SendEmail,
} from "@enterprise-agentic-saas/email"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"
import {
  findInvitationForResend,
  resendInvitationById,
} from "./modules/organizations/repository"

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

describe("organization invitation conflicts and bulk requests", () => {
  it("revives an expired row after retiring a newer time-expired duplicate", async () => {
    const db = await createSeededDb()
    const createdAt = new Date("2025-11-01T00:00:00.000Z")
    await db.insert(schema.invitation).values([
      {
        id: "stored_expired_duplicate",
        organizationId: "org_1",
        email: "duplicate-expiry@example.test",
        role: "member",
        status: "expired",
        expiresAt: new Date(0),
        createdAt,
        inviterId: "user_3",
      },
      {
        id: "effective_expired_duplicate",
        organizationId: "org_1",
        email: "duplicate-expiry@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(0),
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
        inviterId: "user_3",
      },
    ])
    await db.insert(schema.invitationEmailJobs).values({
      id: "effective_expired_duplicate_job",
      invitationId: "effective_expired_duplicate",
      status: "processing",
      attempts: 2,
      lockedAt: new Date(),
      createdAt,
    })
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest(
        "/organizations/org_1/invitations/stored_expired_duplicate/resend",
        { method: "POST", userId: "user_3" }
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      revived: true,
      invitation: {
        id: "stored_expired_duplicate",
        status: "pending",
        createdAt: createdAt.toISOString(),
      },
    })
    expect(
      await db
        .select({ id: schema.invitation.id, status: schema.invitation.status })
        .from(schema.invitation)
    ).toEqual([
      { id: "stored_expired_duplicate", status: "pending" },
      { id: "effective_expired_duplicate", status: "expired" },
    ])
    expect(
      await db
        .select({ status: schema.invitationEmailJobs.status })
        .from(schema.invitationEmailJobs)
        .where(
          eq(schema.invitationEmailJobs.id, "effective_expired_duplicate_job")
        )
    ).toEqual([{ status: "canceled" }])
  })

  it("fails closed for resend role, terminal state, tenant, and recipient conflicts", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.invitation).values([
      {
        id: "admin_role_resend",
        organizationId: "org_1",
        email: "admin-role@example.test",
        role: "admin",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_1",
      },
      ...["accepted", "rejected", "canceled"].map((status) => ({
        id: `${status}_resend`,
        organizationId: "org_1",
        email: `${status}@example.test`,
        role: "member",
        status,
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_1",
      })),
      {
        id: "other_tenant_resend",
        organizationId: "org_2",
        email: "other-tenant@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_2",
      },
      {
        id: "existing_member_resend",
        organizationId: "org_1",
        email: "user4@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_1",
      },
      {
        id: "expired_duplicate_resend",
        organizationId: "org_1",
        email: "duplicate-resend@example.test",
        role: "member",
        status: "expired",
        expiresAt: new Date(0),
        createdAt: new Date(0),
        inviterId: "user_1",
      },
      {
        id: "other_pending_resend",
        organizationId: "org_1",
        email: "duplicate-resend@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_1",
      },
    ])
    const app = createApp(db)

    const adminForbidden = await app.handle(
      jsonRequest("/organizations/org_1/invitations/admin_role_resend/resend", {
        method: "POST",
        userId: "user_3",
      })
    )
    expect(adminForbidden.status).toBe(403)
    const staleSuperAdmin = await app.handle(
      jsonRequest("/organizations/org_1/invitations/admin_role_resend/resend", {
        method: "POST",
        userId: "user_1",
        fresh: false,
      })
    )
    expect(staleSuperAdmin.status).toBe(403)
    expect(await staleSuperAdmin.json()).toMatchObject({
      error: {
        code: "step_up_required",
        context: { action: "organization.invitation.resend_admin" },
      },
    })

    for (const status of ["accepted", "rejected", "canceled"]) {
      // oxlint-disable-next-line no-await-in-loop -- each terminal response has a separate immutable fixture.
      const response = await app.handle(
        jsonRequest(
          `/organizations/org_1/invitations/${status}_resend/resend`,
          {
            method: "POST",
            userId: "user_3",
          }
        )
      )
      expect(response.status).toBe(409)
      // oxlint-disable-next-line no-await-in-loop -- each response body validates the corresponding terminal fixture.
      expect(await response.json()).toMatchObject({
        error: {
          context: { reason: "invitation_not_resendable" },
        },
      })
    }

    for (const invitationId of ["other_tenant_resend", "does_not_exist"]) {
      // oxlint-disable-next-line no-await-in-loop -- tenant and missing-resource probes must remain indistinguishable.
      const response = await app.handle(
        jsonRequest(`/organizations/org_1/invitations/${invitationId}/resend`, {
          method: "POST",
          userId: "user_3",
        })
      )
      expect(response.status).toBe(404)
    }
    expect(await db.select().from(schema.rateLimit)).toHaveLength(0)

    for (const invitationId of [
      "existing_member_resend",
      "expired_duplicate_resend",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each conflict validates an independent recipient invariant.
      const response = await app.handle(
        jsonRequest(`/organizations/org_1/invitations/${invitationId}/resend`, {
          method: "POST",
          userId: "user_3",
        })
      )
      // oxlint-disable-next-line no-await-in-loop -- each body belongs to the sequential conflict probe above.
      const body = await response.json()
      expect(response.status).toBe(409)
      expect(body).toMatchObject({
        error: {
          context: { reason: "invitation_recipient_conflict" },
        },
      })
      expect(JSON.stringify(body)).not.toMatch(/user4|duplicate-resend/i)
    }

    expect(invitationEmailSendSpy).not.toHaveBeenCalled()
    expect(await db.select().from(schema.auditLogs)).toHaveLength(0)
    expect(
      (await db.select().from(schema.rateLimit)).map(
        ({ count: value }) => value
      )
    ).toEqual([2, 2])
  })

  it("revalidates resend membership and role inside the mutation transaction", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.invitation).values([
      {
        id: "member_role_toctou",
        organizationId: "org_1",
        email: "member-role-toctou@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_1",
      },
      {
        id: "admin_role_toctou",
        organizationId: "org_1",
        email: "admin-role-toctou@example.test",
        role: "admin",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_1",
      },
    ])

    await expect(
      findInvitationForResend(db, {
        organizationId: "org_1",
        invitationId: "member_role_toctou",
      })
    ).resolves.toMatchObject({ role: "member", status: "pending" })
    await db
      .update(schema.member)
      .set({ role: "member" })
      .where(eq(schema.member.id, "member_3"))
    await expect(
      resendInvitationById(db, {
        actorUserId: "user_3",
        organizationId: "org_1",
        invitationId: "member_role_toctou",
      })
    ).resolves.toEqual({ kind: "actor_forbidden" })

    await db
      .update(schema.member)
      .set({ role: "admin" })
      .where(eq(schema.member.id, "member_3"))
    await expect(
      resendInvitationById(db, {
        actorUserId: "user_3",
        organizationId: "org_1",
        invitationId: "admin_role_toctou",
      })
    ).resolves.toEqual({ kind: "actor_forbidden" })

    await db.delete(schema.member).where(eq(schema.member.id, "member_3"))
    await expect(
      resendInvitationById(db, {
        actorUserId: "user_3",
        organizationId: "org_1",
        invitationId: "member_role_toctou",
      })
    ).resolves.toEqual({ kind: "actor_not_member" })

    expect(await db.select().from(schema.invitationEmailJobs)).toHaveLength(0)
    expect(await db.select().from(schema.auditLogs)).toHaveLength(0)
    expect(
      (await db.select().from(schema.invitation)).map(({ status }) => status)
    ).toEqual(["pending", "pending"])
  })

  it("normalizes and deduplicates a bulk invitation before durable enqueue", async () => {
    const db = await createSeededDb()
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: {
          emails: [
            " First@Example.test ",
            "first@example.test",
            "SECOND@example.test",
          ],
          role: "member",
        },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ delivery: "queued", queuedCount: 2 })
    expect(
      body.invitations.map((item: { email: string }) => item.email)
    ).toEqual(["first@example.test", "second@example.test"])
    expect(invitationEmailSendSpy).toHaveBeenCalledTimes(2)
    expect(
      invitationEmailSendSpy.mock.calls.map(([input]) => input.to)
    ).toEqual(
      expect.arrayContaining(["first@example.test", "second@example.test"])
    )

    const invitations = await db.select().from(schema.invitation)
    const jobs = await db.select().from(schema.invitationEmailJobs)
    const audits = await db.select().from(schema.auditLogs)
    const quotas = await db.select().from(schema.rateLimit)
    expect(invitations).toHaveLength(2)
    expect(jobs).toHaveLength(2)
    expect(jobs.every(({ status }) => status === "completed")).toBe(true)
    expect(
      audits.filter(
        ({ action }) => action === "organization.invitation.created"
      )
    ).toHaveLength(2)
    expect(quotas.map(({ count: value }) => value)).toEqual([2, 2])
  })

  it("rolls back the entire batch on a safe email conflict but keeps quota probes", async () => {
    const db = await createSeededDb()
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: {
          emails: [
            "first-fresh@example.test",
            "USER4@example.test",
            "second-fresh@example.test",
          ],
          role: "member",
        },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      error: {
        code: "conflict",
        context: {
          field: "emails",
          reason: "conflict",
          resource: "invitation",
        },
        fieldErrors: { emails: ["One or more emails cannot be invited"] },
        message: "One or more emails cannot be invited",
      },
    })
    expect(JSON.stringify(body)).not.toMatch(/first-fresh|user4|second-fresh/i)
    expect(await db.select().from(schema.invitation)).toHaveLength(0)
    expect(await db.select().from(schema.invitationEmailJobs)).toHaveLength(0)
    expect(await db.select().from(schema.auditLogs)).toHaveLength(0)
    expect(
      (await db.select().from(schema.rateLimit)).map(
        ({ count: value }) => value
      )
    ).toEqual([3, 3])
    expect(invitationEmailSendSpy).not.toHaveBeenCalled()
  })

  it("enforces the 1 to 20 recipient contract before reserving quota", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const emails = Array.from(
      { length: 20 },
      (_, index) => `bulk-${index}@example.test`
    )

    for (const invalidEmails of [[], [...emails, "overflow@example.test"]]) {
      // oxlint-disable-next-line no-await-in-loop -- each request proves validation leaves the same database untouched.
      const invalid = await app.handle(
        jsonRequest("/organizations/org_1/invitations", {
          method: "POST",
          userId: "user_3",
          body: { emails: invalidEmails, role: "member" },
        })
      )
      expect(invalid.status).toBe(400)
    }
    expect(await db.select().from(schema.rateLimit)).toHaveLength(0)

    const maximum = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { emails, role: "member" },
      })
    )
    expect(maximum.status).toBe(201)
    expect(await maximum.json()).toMatchObject({ queuedCount: 20 })
    expect(await db.select().from(schema.invitation)).toHaveLength(20)
    expect(await db.select().from(schema.invitationEmailJobs)).toHaveLength(20)
  })
})
