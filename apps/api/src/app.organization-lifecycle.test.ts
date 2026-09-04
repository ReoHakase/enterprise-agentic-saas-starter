import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"
import { createAuthorizationModule } from "./modules/authorization/module"
import { createOrganizationsApplication } from "./modules/organizations/module"
import { resolveAndPersistActiveOrganizationId } from "./modules/users/repository"

type OrganizationsApplication = ReturnType<
  typeof createOrganizationsApplication
>
type TestDb = Awaited<ReturnType<typeof createSeededDb>>
type DeleteOrganizationInput = Parameters<
  OrganizationsApplication["service"]["deleteOrganization"]
>[0]

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

const serviceDeletionInput = {
  confirmation: "DELETE",
  idempotencyKey: "delete_org_1_service_01",
  organizationId: "org_1",
  slug: "org-one",
} as const

const freshServiceSession = () => ({
  activeOrganizationId: "org_1",
  createdAt: new Date(),
  id: "session_1",
})

const expectOrganizationDeletionNotScheduled = async (db: TestDb) => {
  expect(
    await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, "org_1"))
  ).toEqual([{ id: "org_1" }])
  expect(await db.select().from(schema.organizationDeletionJobs)).toEqual([])
}

describe("organization contextと作成と削除guard", () => {
  it("最近の有効なorganization contextを新しいsessionへ引き継ぐ", async () => {
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
  })

  it("有効なorganization contextが曖昧な場合は利用者の選択を要求する", async () => {
    const db = await createSeededDb()
    const now = new Date()
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
    const [ambiguousSession] = await db
      .select({ updatedAt: schema.session.updatedAt })
      .from(schema.session)
      .where(eq(schema.session.id, "session_user5_ambiguous"))
    const ambiguousAgentContexts = await db
      .select({ sessionId: schema.agentSessionContexts.sessionId })
      .from(schema.agentSessionContexts)
      .where(
        eq(schema.agentSessionContexts.sessionId, "session_user5_ambiguous")
      )
    expect(ambiguousSession?.updatedAt).toEqual(now)
    expect(ambiguousAgentContexts).toEqual([])
  })

  it.each([
    {
      body: { name: "Invalid", slug: "!!!" },
      label: "利用できない文字を含むslug",
      method: "POST",
      path: "/organizations",
    },
    {
      body: { name: "Reserved", slug: "auth" },
      label: "予約済みslugによる作成",
      method: "POST",
      path: "/organizations",
    },
    {
      body: { name: "Too Long", slug: "x".repeat(49) },
      label: "上限を超えるslug",
      method: "POST",
      path: "/organizations",
    },
    {
      body: { slug: "auth" },
      label: "予約済みslugへの更新",
      method: "PATCH",
      path: "/organizations/org_1",
    },
  ] as const)("$labelを拒否する", async ({ body, method, path }) => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest(path, { body, method, userId: "user_1" })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "validation_error" })
  })

  it("旧予約語のinvitationsをorganization slugとして受理する", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/organizations", {
        method: "POST",
        userId: "user_1",
        body: { name: "Invitation Operations", slug: "invitations" },
      })
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ slug: "invitations" })
  })

  it("organization slugをserverで正規化する", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/organizations", {
        method: "POST",
        userId: "user_1",
        body: { name: "My Team", slug: " My Team " },
      })
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ slug: "my-team" })
  })

  it.each([
    {
      body: { name: "Duplicate", slug: "org-one" },
      label: "organization作成",
      method: "POST",
      path: "/organizations",
    },
    {
      body: { slug: "org-two" },
      label: "organization更新",
      method: "PATCH",
      path: "/organizations/org_1",
    },
  ] as const)("$labelで重複slugを拒否する", async ({ body, method, path }) => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest(path, { body, method, userId: "user_1" })
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: "conflict" })
  })

  it("別tenantのorganization slugを更新できない", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/organizations/org_2", {
        method: "PATCH",
        userId: "user_1",
        activeOrganizationId: "org_2",
        body: { slug: "other-team" },
      })
    )

    expect(response.status).toBe(404)
  })

  it.each([
    {
      activeOrganizationId: undefined,
      body: {
        confirmation: "DELETE",
        idempotencyKey: "delete_org_1_request_01",
        slug: "org-one",
      },
      expectedError: "forbidden",
      expectedStatus: 403,
      fresh: undefined,
      label: "adminによる削除",
      path: "/organizations/org_1",
      sessionId: undefined,
      userId: "user_3",
    },
    {
      activeOrganizationId: undefined,
      body: {
        confirmation: "DELETE",
        idempotencyKey: "delete_org_1_request_01",
        slug: "org-one",
      },
      expectedError: "step_up_required",
      expectedStatus: 403,
      fresh: false,
      label: "freshでないsessionによる削除",
      path: "/organizations/org_1",
      sessionId: undefined,
      userId: "user_1",
    },
    {
      activeOrganizationId: undefined,
      body: {
        confirmation: "DELETE",
        idempotencyKey: "delete_org_1_request_01",
        slug: "org-two",
      },
      expectedError: "confirmation_required",
      expectedStatus: 400,
      fresh: undefined,
      label: "一致しないslugによる削除",
      path: "/organizations/org_1",
      sessionId: "session_1",
      userId: "user_1",
    },
    {
      activeOrganizationId: undefined,
      body: {
        confirmation: "delete",
        idempotencyKey: "delete_org_1_request_01",
        slug: "org-one",
      },
      expectedError: "validation_error",
      expectedStatus: 400,
      fresh: undefined,
      label: "不正なconfirmationによる削除",
      path: "/organizations/org_1",
      sessionId: undefined,
      userId: "user_1",
    },
    {
      activeOrganizationId: undefined,
      body: {
        confirmation: "DELETE",
        idempotencyKey: "short",
        slug: "org-one",
      },
      expectedError: "validation_error",
      expectedStatus: 400,
      fresh: undefined,
      label: "不正なidempotency keyによる削除",
      path: "/organizations/org_1",
      sessionId: undefined,
      userId: "user_1",
    },
    {
      activeOrganizationId: "org_2",
      body: {
        confirmation: "DELETE",
        idempotencyKey: "delete_org_1_request_01",
        slug: "org-two",
      },
      expectedError: "not_found",
      expectedStatus: 404,
      fresh: undefined,
      label: "別tenantのorganization削除",
      path: "/organizations/org_2",
      sessionId: undefined,
      userId: "user_1",
    },
  ] as const)(
    "$labelを拒否する",
    async ({
      activeOrganizationId,
      body,
      expectedError,
      expectedStatus,
      fresh,
      path,
      sessionId,
      userId,
    }) => {
      const app = createApp(await createSeededDb())
      const response = await app.handle(
        jsonRequest(path, {
          method: "DELETE",
          userId,
          body,
          ...(activeOrganizationId ? { activeOrganizationId } : {}),
          ...(fresh === undefined ? {} : { fresh }),
          ...(sessionId ? { sessionId } : {}),
        })
      )

      expect(response.status).toBe(expectedStatus)
      expect(await response.json()).toMatchObject({ error: expectedError })
    }
  )

  it.each([
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        session,
        userId: "user_3",
      }),
      expectedCode: "forbidden",
      label: "ownerでない利用者",
      prepare: undefined,
    },
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        session: { ...session, activeOrganizationId: "org_2" },
        userId: "user_1",
      }),
      expectedCode: "active_organization_mismatch",
      label: "別のactive organizationを持つsession",
      prepare: undefined,
    },
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        session: { ...session, createdAt: new Date(0) },
        userId: "user_1",
      }),
      expectedCode: "step_up_required",
      label: "freshでないsession",
      prepare: undefined,
    },
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        confirmation: "delete",
        session,
        userId: "user_1",
      }),
      expectedCode: "confirmation_required",
      label: "一致しないconfirmation",
      prepare: undefined,
    },
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        session,
        slug: "org-two",
        userId: "user_1",
      }),
      expectedCode: "confirmation_required",
      label: "一致しないslug",
      prepare: undefined,
    },
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        session,
        userId: "user_1",
      }),
      expectedCode: "forbidden",
      label: "永続化されたowner roleを失った利用者",
      prepare: (db: TestDb) =>
        db
          .update(schema.member)
          .set({ role: "admin" })
          .where(eq(schema.member.id, "member_1")),
    },
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        session,
        userId: "user_1",
      }),
      expectedCode: "active_organization_mismatch",
      label: "期限切れとして永続化されたsession",
      prepare: (db: TestDb) =>
        db
          .update(schema.session)
          .set({ expiresAt: new Date(0) })
          .where(eq(schema.session.id, "session_1")),
    },
    {
      buildInput: (session: ReturnType<typeof freshServiceSession>) => ({
        ...serviceDeletionInput,
        session,
        userId: "user_1",
      }),
      expectedCode: "active_organization_mismatch",
      label: "別のactive organizationへ更新されたsession",
      prepare: (db: TestDb) =>
        db
          .update(schema.session)
          .set({
            activeOrganizationId: "org_2",
            expiresAt: new Date(Date.now() + 60_000),
          })
          .where(eq(schema.session.id, "session_1")),
    },
  ] satisfies ReadonlyArray<{
    buildInput: (
      session: ReturnType<typeof freshServiceSession>
    ) => DeleteOrganizationInput
    expectedCode: string
    label: string
    prepare: ((db: TestDb) => Promise<unknown>) | undefined
  }>)(
    "$labelではserviceからorganizationを削除しない",
    async ({ buildInput, expectedCode, prepare }) => {
      const db = await createSeededDb()
      if (prepare) await prepare(db)

      await expect(
        deleteOrganization(db, buildInput(freshServiceSession()))
      ).rejects.toMatchObject({ code: expectedCode })
      await expectOrganizationDeletionNotScheduled(db)
    }
  )
})
