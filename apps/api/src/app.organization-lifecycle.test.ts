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
import { createAuthorizationModule } from "./modules/authorization/module"
import { createOrganizationsApplication } from "./modules/organizations/module"
import { resolveAndPersistActiveOrganizationId } from "./modules/users/repository"

type OrganizationsApplication = ReturnType<
  typeof createOrganizationsApplication
>

const deleteOrganization = (
  db: Parameters<typeof createOrganizationsApplication>[0],
  input: Parameters<
    OrganizationsApplication["service"]["deleteOrganization"]
  >[0]
) =>
  createOrganizationsApplication(
    db,
    createAuthorizationModule(db).authorization
  ).service.deleteOrganization(input)

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

describe("organization context, creation, and deletion guards", () => {
  it("preserves recent valid organization context but requires a choice when ambiguous", async () => {
    const db = await createSeededDb()
    const now = new Date()
    await db.insert(schema.session).values([
      {
        id: "session_user5_recent",
        userId: "user_5",
        token: "token_user5_recent",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: new Date(now.getTime() - 2000),
        updatedAt: new Date(now.getTime() - 1000),
        activeOrganizationId: "org_2",
      },
      {
        id: "session_user5_current",
        userId: "user_5",
        token: "token_user5_current",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
        activeOrganizationId: null,
      },
    ])

    await expect(
      resolveAndPersistActiveOrganizationId(db, {
        sessionId: "session_user5_current",
        userId: "user_5",
        activeOrganizationId: null,
      })
    ).resolves.toBe("org_2")

    await db.delete(schema.session).where(eq(schema.session.userId, "user_5"))
    await db.insert(schema.session).values({
      id: "session_user5_ambiguous",
      userId: "user_5",
      token: "token_user5_ambiguous",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: null,
    })
    await expect(
      resolveAndPersistActiveOrganizationId(db, {
        sessionId: "session_user5_ambiguous",
        userId: "user_5",
        activeOrganizationId: null,
      })
    ).resolves.toBeNull()
  })

  it("validates normalized organization slugs and maps collisions to 409", async () => {
    const app = createApp(await createSeededDb())

    const invalidResponses = await Promise.all(
      ["!!!", "auth", "x".repeat(101)].map((slug) =>
        app.handle(
          jsonRequest("/organizations", {
            method: "POST",
            userId: "user_1",
            body: { name: "Invalid", slug },
          })
        )
      )
    )
    expect(invalidResponses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ])

    const formerlyReservedCreate = await app.handle(
      jsonRequest("/organizations", {
        method: "POST",
        userId: "user_1",
        body: { name: "Invitation Operations", slug: "invitations" },
      })
    )
    expect(formerlyReservedCreate.status).toBe(201)
    expect(await formerlyReservedCreate.json()).toMatchObject({
      slug: "invitations",
    })

    const normalizedCreate = await app.handle(
      jsonRequest("/organizations", {
        method: "POST",
        userId: "user_1",
        body: { name: "My Team", slug: " My Team " },
      })
    )
    expect(normalizedCreate.status).toBe(201)
    expect(await normalizedCreate.json()).toMatchObject({ slug: "my-team" })

    const duplicateCreate = await app.handle(
      jsonRequest("/organizations", {
        method: "POST",
        userId: "user_1",
        body: { name: "Duplicate", slug: "org-one" },
      })
    )
    expect(duplicateCreate.status).toBe(409)
    expect(await duplicateCreate.json()).toMatchObject({ error: "conflict" })

    const duplicateUpdate = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "PATCH",
        userId: "user_1",
        body: { slug: "org-two" },
      })
    )
    expect(duplicateUpdate.status).toBe(409)
  })

  it("rejects unsafe organization deletion attempts with field-level recovery contracts", async () => {
    const app = createApp(await createSeededDb())
    const validBody = {
      slug: "org-one",
      confirmation: "DELETE",
      idempotencyKey: "delete_org_1_request_01",
    }

    const admin = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_3",
        body: validBody,
      })
    )
    expect(admin.status).toBe(403)
    expect(await admin.json()).toMatchObject({ error: "forbidden" })

    const stale = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_1",
        fresh: false,
        body: validBody,
      })
    )
    expect(stale.status).toBe(403)
    expect(await stale.json()).toMatchObject({ error: "step_up_required" })

    const wrongSlug = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_1",
        sessionId: "session_1",
        body: { ...validBody, slug: "org-two" },
      })
    )
    expect(wrongSlug.status).toBe(400)
    expect(await wrongSlug.json()).toMatchObject({
      error: "confirmation_required",
    })

    const invalidBodies = [
      { ...validBody, confirmation: "delete" },
      { ...validBody, idempotencyKey: "short" },
    ]
    const invalidResponses = await Promise.all(
      invalidBodies.map((body) =>
        app.handle(
          jsonRequest("/organizations/org_1", {
            method: "DELETE",
            userId: "user_1",
            body,
          })
        )
      )
    )
    expect(invalidResponses.map((response) => response.status)).toEqual([
      400, 400,
    ])
    const [invalidConfirmation, invalidKey] = await Promise.all(
      invalidResponses.map((response) => response.json())
    )
    expect(invalidConfirmation).toMatchObject({ error: "validation_error" })
    expect(invalidKey).toMatchObject({ error: "validation_error" })

    const otherTenant = await app.handle(
      jsonRequest("/organizations/org_2", {
        method: "DELETE",
        userId: "user_1",
        activeOrganizationId: "org_2",
        body: { ...validBody, slug: "org-two" },
      })
    )
    expect(otherTenant.status).toBe(404)
    expect(await otherTenant.json()).toMatchObject({ error: "not_found" })
  })

  it("keeps organization deletion authorization defensive in the service", async () => {
    const db = await createSeededDb()
    const freshSession = {
      id: "session_1",
      activeOrganizationId: "org_1",
      createdAt: new Date(),
    }
    const input = {
      organizationId: "org_1",
      slug: "org-one",
      confirmation: "DELETE",
      idempotencyKey: "delete_org_1_service_01",
    }

    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_3",
        session: freshSession,
      })
    ).rejects.toMatchObject({ code: "forbidden" })
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: { ...freshSession, activeOrganizationId: "org_2" },
      })
    ).rejects.toMatchObject({
      code: "active_organization_mismatch",
    })
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: { ...freshSession, createdAt: new Date(0) },
      })
    ).rejects.toMatchObject({ code: "step_up_required" })
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: freshSession,
        confirmation: "delete",
      })
    ).rejects.toMatchObject({ code: "confirmation_required" })
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: freshSession,
        slug: "org-two",
      })
    ).rejects.toMatchObject({ code: "confirmation_required" })

    await db
      .update(schema.member)
      .set({ role: "admin" })
      .where(eq(schema.member.id, "member_1"))
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: freshSession,
      })
    ).rejects.toMatchObject({ code: "forbidden" })
    await db
      .update(schema.member)
      .set({ role: "owner" })
      .where(eq(schema.member.id, "member_1"))

    await db
      .update(schema.session)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.session.id, "session_1"))
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: freshSession,
      })
    ).rejects.toMatchObject({ code: "active_organization_mismatch" })

    await db
      .update(schema.session)
      .set({
        activeOrganizationId: "org_2",
        expiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(schema.session.id, "session_1"))
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: freshSession,
      })
    ).rejects.toMatchObject({ code: "active_organization_mismatch" })

    expect(
      await db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.id, "org_1"))
    ).toEqual([{ id: "org_1" }])
    expect(await db.select().from(schema.organizationDeletionJobs)).toEqual([])
  })
})
