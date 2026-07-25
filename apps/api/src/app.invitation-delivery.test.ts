import * as schema from "@enterprise-agentic-saas/db/schema"
import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
  SendEmail,
} from "@enterprise-agentic-saas/email"
import { sql } from "drizzle-orm"
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

describe("organization invitation delivery and concurrency", () => {
  it("keeps overlapping bulk invitations deterministic and atomic", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const responses = await Promise.all(
      [
        ["overlap@example.test", "first-only@example.test"],
        ["overlap@example.test", "second-only@example.test"],
      ].map((emails) =>
        app.handle(
          jsonRequest("/organizations/org_1/invitations", {
            method: "POST",
            userId: "user_3",
            body: { emails, role: "member" },
          })
        )
      )
    )
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1)
    expect(responses.filter(({ status }) => status === 409)).toHaveLength(1)

    const success = responses.find(({ status }) => status === 201)
    const conflict = responses.find(({ status }) => status === 409)
    if (!success || !conflict) {
      throw new Error("Expected one complete batch and one conflict")
    }
    const successBody = await success.json()
    const successEmails = successBody.invitations.map(
      ({ email }: { email: string }) => email
    )
    expect(successEmails).toHaveLength(2)
    expect(await conflict.json()).toMatchObject({
      error: {
        context: { field: "emails", reason: "conflict" },
        fieldErrors: { emails: ["One or more emails cannot be invited"] },
      },
    })

    const storedEmails = (await db.select().from(schema.invitation)).map(
      ({ email }) => email
    )
    expect(storedEmails).toHaveLength(2)
    expect(storedEmails).toEqual(expect.arrayContaining(successEmails))
    expect(await db.select().from(schema.invitationEmailJobs)).toHaveLength(2)
    expect(await db.select().from(schema.auditLogs)).toHaveLength(2)
    expect(
      (await db.select().from(schema.rateLimit)).map(
        ({ count: value }) => value
      )
    ).toEqual([4, 4])
  })

  it("returns 201 after a safe durable email failure", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    invitationEmailSendSpy.mockRejectedValueOnce(
      new Error("provider detail private-recipient@example.test")
    )

    const response = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: {
          emails: ["private-recipient@example.test"],
          role: "member",
        },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ delivery: "queued", queuedCount: 1 })
    expect(JSON.stringify(body)).not.toMatch(/provider detail/i)
    expect(await db.select().from(schema.invitation)).toMatchObject([
      { email: "private-recipient@example.test", status: "pending" },
    ])
    expect(await db.select().from(schema.invitationEmailJobs)).toMatchObject([
      {
        attempts: 1,
        lastErrorCode: "email_delivery_failed",
        status: "failed",
      },
    ])
    expect(
      JSON.stringify(await db.select().from(schema.invitationEmailJobs))
    ).not.toMatch(/provider detail|private-recipient/i)
  })

  it("persists blocked quota probes and returns a safe retry interval", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const invite = (prefix: string, length: number) =>
      app.handle(
        jsonRequest("/organizations/org_1/invitations", {
          method: "POST",
          userId: "user_3",
          body: {
            emails: Array.from(
              { length },
              (_, index) => `${prefix}-${index}@example.test`
            ),
            role: "member",
          },
        })
      )

    await expect(invite("quota-a", 20)).resolves.toMatchObject({ status: 201 })
    await expect(invite("quota-b", 10)).resolves.toMatchObject({ status: 201 })
    const blocked = await invite("quota-c", 1)
    const body = await blocked.json()

    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(body).toMatchObject({
      error: {
        code: "rate_limited",
        context: { retryAfter: expect.any(Number) },
      },
    })
    expect(JSON.stringify(body)).not.toContain("quota-c-0@example.test")
    expect(
      (await db.select().from(schema.rateLimit)).map(
        ({ count: value }) => value
      )
    ).toEqual([31, 31])
    expect(
      (await db.select().from(schema.invitation)).some(
        ({ email }) => email === "quota-c-0@example.test"
      )
    ).toBe(false)
  })

  it("cancels retryable and in-flight delivery jobs with the invitation", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.invitation).values([
      {
        id: "failed_delivery_invitation",
        organizationId: "org_1",
        email: "failed-delivery@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_3",
      },
      {
        id: "processing_delivery_invitation",
        organizationId: "org_1",
        email: "processing-delivery@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_3",
      },
    ])
    await db.insert(schema.invitationEmailJobs).values([
      {
        id: "failed_delivery_job",
        invitationId: "failed_delivery_invitation",
        status: "failed",
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() + 30_000),
        createdAt: now,
      },
      {
        id: "processing_delivery_job",
        invitationId: "processing_delivery_invitation",
        status: "processing",
        attempts: 1,
        lockedAt: now,
        createdAt: now,
      },
    ])
    const app = createApp(db)

    for (const invitationId of [
      "failed_delivery_invitation",
      "processing_delivery_invitation",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each cancellation must commit before its durable state is asserted.
      const response = await app.handle(
        jsonRequest(`/organizations/org_1/invitations/${invitationId}`, {
          method: "DELETE",
          userId: "user_3",
        })
      )
      expect(response.status).toBe(200)
    }

    expect(
      (await db.select().from(schema.invitation)).map(({ status }) => status)
    ).toEqual(["canceled", "canceled"])
    expect(
      (await db.select().from(schema.invitationEmailJobs)).map(
        ({ status }) => status
      )
    ).toEqual(["canceled", "canceled"])
  })

  it("reports expired invitations consistently and preserves terminal states", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.invitation).values([
      {
        id: "accepted_invitation",
        organizationId: "org_1",
        email: "accepted@example.test",
        role: "member",
        status: "accepted",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_3",
      },
      {
        id: "stale_pending_invitation",
        organizationId: "org_1",
        email: "stale@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(0),
        createdAt: new Date(0),
        inviterId: "user_3",
      },
      {
        id: "other_tenant_invitation",
        organizationId: "org_2",
        email: "other@example.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        inviterId: "user_2",
      },
    ])
    const app = createApp(db)

    const list = await app.handle(
      jsonRequest("/organizations/org_1/invitations", { userId: "user_3" })
    )
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "stale_pending_invitation",
          status: "expired",
        }),
      ])
    )

    const acceptedResponse = await app.handle(
      jsonRequest("/organizations/org_1/invitations/accepted_invitation", {
        method: "DELETE",
        userId: "user_3",
      })
    )
    const expiredResponse = await app.handle(
      jsonRequest("/organizations/org_1/invitations/stale_pending_invitation", {
        method: "DELETE",
        userId: "user_3",
      })
    )
    const terminalResponses = [acceptedResponse, expiredResponse]
    expect(terminalResponses.map((response) => response.status)).toEqual([
      409, 409,
    ])
    expect(
      await Promise.all(
        terminalResponses.map(
          async (response) => (await response.json()).error.context.reason
        )
      )
    ).toEqual(["invitation_not_pending", "invitation_not_pending"])

    const otherTenant = await app.handle(
      jsonRequest("/organizations/org_1/invitations/other_tenant_invitation", {
        method: "DELETE",
        userId: "user_3",
      })
    )
    expect(otherTenant.status).toBe(404)

    const storedRows = await db.select().from(schema.invitation)
    expect(
      storedRows.find((row) => row.id === "accepted_invitation")?.status
    ).toBe("accepted")
    expect(
      storedRows.find((row) => row.id === "stale_pending_invitation")?.status
    ).toBe("expired")
  })

  it("maps the database invitation uniqueness fallback to the email field", async () => {
    const db = await createSeededDb()
    await db.run(sql`
      create trigger invitation_unique_fallback_test
      before insert on invitation
      when new.email = 'fallback@example.test'
      begin
        select raise(abort, 'invitation_pending_organization_email_uidx');
      end
    `)
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { emails: ["fallback@example.test"], role: "member" },
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
        fieldErrors: {
          emails: ["One or more emails cannot be invited"],
        },
      },
    })
    expect(JSON.stringify(body)).not.toContain("fallback@example.test")
  })

  it("serializes concurrent duplicate invitations", async () => {
    const app = createApp(await createSeededDb())
    const responses = await Promise.all(
      ["first", "second"].map(() =>
        app.handle(
          jsonRequest("/organizations/org_1/invitations", {
            method: "POST",
            userId: "user_3",
            body: { emails: ["race@example.test"], role: "member" },
          })
        )
      )
    )
    expect(
      responses.filter((response) => response.status === 201)
    ).toHaveLength(1)
    expect(
      responses.filter((response) => response.status === 409)
    ).toHaveLength(1)
    const conflict = responses.find((response) => response.status === 409)
    if (!conflict) {
      throw new Error("Expected one invitation conflict response")
    }
    expect(await conflict.json()).toMatchObject({
      error: {
        context: { field: "emails", reason: "conflict" },
        fieldErrors: {
          emails: ["One or more emails cannot be invited"],
        },
      },
    })
  })

  it("checks invitation role and freshness before reserving quota", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const stale = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_1",
        fresh: false,
        body: { emails: ["new-admin@example.test"], role: "admin" },
      })
    )
    expect(stale.status).toBe(403)
    expect((await stale.json()).error.code).toBe("step_up_required")

    const member = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_4",
        body: { emails: ["member-probe@example.test"], role: "member" },
      })
    )
    expect(member.status).toBe(403)
    expect(await db.select().from(schema.rateLimit)).toHaveLength(0)

    const fresh = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_1",
        body: { emails: ["new-admin@example.test"], role: "admin" },
      })
    )
    expect(fresh.status).toBe(201)
    expect(await fresh.json()).toMatchObject({
      invitations: [{ email: "new-admin@example.test", role: "admin" }],
    })
  })
})
