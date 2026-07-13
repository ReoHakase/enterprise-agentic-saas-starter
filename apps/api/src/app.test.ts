import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"
import { env } from "./env"
import { resolveAndPersistActiveOrganizationId } from "./modules/users/repository"
import { corsPlugin } from "./plugins/cors"

const testDb = () =>
  drizzle(createClient({ url: "file::memory:?cache=shared" }), { schema })

const createSeededDb = async () => {
  const db = testDb()

  await Promise.all(
    [
      "todo_comments",
      "audit_logs",
      "todos",
      "invitation",
      "session",
      "member",
      "organization",
      "user",
    ].map((table) => db.run(sql.raw(`drop table if exists ${table}`)))
  )

  await db.run(sql`
    create table user (
      id text primary key,
      name text not null,
      email text not null unique,
      email_verified integer not null default 1,
      image text,
      created_at integer not null,
      updated_at integer not null
    )
  `)
  await db.run(sql`
    create table session (
      id text primary key,
      expires_at integer not null,
      token text not null unique,
      created_at integer not null,
      updated_at integer not null,
      ip_address text,
      user_agent text,
      user_id text not null,
      active_organization_id text
    )
  `)
  await db.run(sql`
    create table organization (
      id text primary key,
      name text not null,
      slug text not null unique,
      logo text,
      created_at integer not null,
      metadata text
    )
  `)
  await db.run(sql`
    create table member (
      id text primary key,
      organization_id text not null,
      user_id text not null,
      role text not null default 'member',
      created_at integer not null
    )
  `)
  await db.run(sql`
    create unique index member_organization_user_uidx
    on member (organization_id, user_id)
  `)
  await db.run(sql`
    create unique index member_super_admin_organization_uidx
    on member (organization_id)
    where role = 'super_admin'
  `)
  await db.run(sql`
    create table invitation (
      id text primary key,
      organization_id text not null,
      email text not null,
      role text,
      status text not null default 'pending',
      expires_at integer not null,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      inviter_id text not null
    )
  `)
  await db.run(sql`
    create table todos (
      id text primary key,
      organization_id text not null,
      number integer not null,
      title text not null,
      description text not null default '',
      status text not null default 'open',
      priority text not null default 'no_priority',
      assignee_id text,
      creator_id text not null,
      labels text not null default '[]',
      due_date integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      unique (organization_id, number)
    )
  `)
  await db.run(sql`
    create table todo_comments (
      id text primary key,
      todo_id text not null,
      organization_id text not null,
      author_id text not null,
      body text not null,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `)
  await db.run(sql`
    create table audit_logs (
      id text primary key,
      organization_id text not null,
      actor_user_id text,
      action text not null,
      target_type text not null,
      target_id text,
      metadata text not null default '{}',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `)

  const now = new Date()
  await db.insert(schema.user).values(
    [1, 2, 3, 4, 5].map((number) => ({
      id: `user_${number}`,
      name: `User ${number}`,
      email: `user${number}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }))
  )
  await db.insert(schema.organization).values([
    { id: "org_1", name: "Org One", slug: "org-one", createdAt: now },
    { id: "org_2", name: "Org Two", slug: "org-two", createdAt: now },
  ])
  await db.insert(schema.member).values([
    {
      id: "member_1",
      userId: "user_1",
      organizationId: "org_1",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "member_2",
      userId: "user_2",
      organizationId: "org_2",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "member_3",
      userId: "user_3",
      organizationId: "org_1",
      role: "admin",
      createdAt: now,
    },
    {
      id: "member_4",
      userId: "user_4",
      organizationId: "org_1",
      role: "member",
      createdAt: now,
    },
    {
      id: "member_5",
      userId: "user_5",
      organizationId: "org_1",
      role: "member",
      createdAt: now,
    },
    {
      id: "member_6",
      userId: "user_5",
      organizationId: "org_2",
      role: "member",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values({
    id: "session_1",
    userId: "user_1",
    token: "token_1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: "org_1",
  })
  await db.insert(schema.todos).values({
    id: "todo_1",
    organizationId: "org_1",
    number: 1,
    title: "Seed issue",
    description: "Tenant-safe seed",
    status: "open",
    priority: "high",
    assigneeId: "user_4",
    creatorId: "user_1",
    labels: ["backend"],
    dueDate: null,
    createdAt: now,
    updatedAt: now,
  })

  return db
}

const authHeaders = (
  userId: string,
  options: {
    activeOrganizationId?: string
    fresh?: boolean
    json?: boolean
  } = {}
) => ({
  ...(options.json === false ? {} : { "content-type": "application/json" }),
  "x-test-user-id": userId,
  "x-test-active-organization-id": options.activeOrganizationId ?? "org_1",
  "x-test-session-created-at": (options.fresh === false
    ? new Date(0)
    : new Date()
  ).toISOString(),
  origin: env.CORS_ORIGIN[0] ?? env.API_PUBLIC_URL,
})

const jsonRequest = (
  path: string,
  input: {
    body?: unknown
    method?: string
    userId: string
    activeOrganizationId?: string
    fresh?: boolean
  }
) =>
  new Request(`http://localhost${path}`, {
    method: input.method ?? "GET",
    headers: authHeaders(input.userId, {
      activeOrganizationId: input.activeOrganizationId,
      fresh: input.fresh,
    }),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

describe("createApp security and OpenAPI", () => {
  it("applies credentialed CORS to existing routes and mounted auth handlers", async () => {
    const trustedOrigin = env.CORS_ORIGIN[0]
    if (!trustedOrigin) {
      throw new Error("Test requires one trusted CORS origin")
    }
    const app = createApp(testDb())
      .mount(async () => Response.json({ mounted: true }))
      .use(corsPlugin)

    const getResponse = await app.handle(
      new Request("http://localhost/health", {
        headers: { origin: trustedOrigin },
      })
    )
    expect(getResponse.headers.get("access-control-allow-origin")).toBe(
      trustedOrigin
    )
    expect(getResponse.headers.get("access-control-allow-credentials")).toBe(
      "true"
    )

    const preflight = await app.handle(
      new Request("http://localhost/auth/multi-session/set-active", {
        method: "OPTIONS",
        headers: {
          origin: trustedOrigin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      })
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      trustedOrigin
    )
    expect(preflight.headers.get("access-control-allow-credentials")).toBe(
      "true"
    )

    const untrusted = await app.handle(
      new Request("http://localhost/health", {
        headers: { origin: "https://attacker.invalid" },
      })
    )
    expect(untrusted.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("rejects unsafe requests with a missing or untrusted Origin", async () => {
    const app = createApp(await createSeededDb())
    const { origin: _origin, ...headersWithoutOrigin } = authHeaders("user_1")

    const missing = await app.handle(
      new Request("http://localhost/organizations/org_1/activate", {
        method: "POST",
        headers: headersWithoutOrigin,
      })
    )
    expect(missing.status).toBe(403)
    expect(await missing.json()).toMatchObject({
      error: {
        code: "csrf_origin_forbidden",
        context: { reason: "missing_origin" },
      },
    })

    const untrusted = await app.handle(
      new Request("http://localhost/organizations/org_1/activate", {
        method: "POST",
        headers: {
          ...authHeaders("user_1"),
          origin: "https://attacker.invalid",
        },
      })
    )
    expect(untrusted.status).toBe(403)
    expect((await untrusted.json()).error.context.reason).toBe(
      "untrusted_origin"
    )

    const trusted = await app.handle(
      jsonRequest("/organizations/org_1/activate", {
        method: "POST",
        userId: "user_1",
      })
    )
    expect(trusted.status).toBe(200)
  })

  it("serves health and a tagged, secured OpenAPI document", async () => {
    const app = createApp(testDb())
    const health = await app.handle(new Request("http://localhost/health"))
    expect(health.status).toBe(200)

    const response = await app.handle(
      new Request("http://localhost/openapi/json")
    )
    const spec = await response.json()
    expect(response.status).toBe(200)
    expect(spec.info.title).toContain("API")
    expect(spec.components.securitySchemes.sessionCookie).toMatchObject({
      in: "cookie",
      type: "apiKey",
    })
    expect(
      spec.paths["/organizations/{organizationId}/ownership-transfer"].post
        .security
    ).toEqual([{ sessionCookie: [] }])
    expect(spec.paths["/todos/{id}"].get.operationId).toBe("getTodo")
    const createOrganizationResponses =
      spec.paths["/organizations"].post.responses
    expect(createOrganizationResponses["201"]).toBeDefined()
    expect(
      createOrganizationResponses["403"].content["application/json"].schema
        .properties.error.properties.code.examples
    ).toContain("csrf_origin_forbidden")
    expect(
      spec.paths["/todos/{id}/comments"].post.responses["201"].content[
        "application/json"
      ].schema.properties.author.required
    ).toEqual(["id", "name", "image"])

    const operationMethods = ["get", "post", "put", "patch", "delete"] as const
    type OpenApiOperation = {
      operationId?: string
      summary?: string
      description?: string
      tags?: string[]
      responses?: Record<string, unknown>
    }
    const paths: Record<
      string,
      Partial<Record<(typeof operationMethods)[number], OpenApiOperation>>
    > = spec.paths
    const operationIds: string[] = []
    for (const [path, pathItem] of Object.entries(paths)) {
      for (const method of operationMethods) {
        const operation = pathItem[method]
        if (!operation) {
          continue
        }
        const label = `${method.toUpperCase()} ${path}`
        expect(operation.operationId, `${label} operationId`).toBeTruthy()
        expect(operation.summary, `${label} summary`).toBeTruthy()
        expect(operation.description, `${label} description`).toBeTruthy()
        expect(operation.tags?.length, `${label} tags`).toBeGreaterThan(0)
        expect(
          Object.keys(operation.responses ?? {}).length,
          `${label} responses`
        ).toBeGreaterThan(0)
        operationIds.push(operation.operationId ?? "")
      }
    }
    expect(new Set(operationIds).size).toBe(operationIds.length)
  })

  it("returns a safe 401 for unauthenticated protected routes", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      new Request("http://localhost/organizations", {
        headers: { "x-request-id": "req_unauthorized" },
      })
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Authentication required",
        context: {},
        requestId: "req_unauthorized",
      },
    })
  })

  it("does not list or load another tenant", async () => {
    const app = createApp(await createSeededDb())
    const list = await app.handle(
      jsonRequest("/organizations", { userId: "user_1" })
    )
    expect((await list.json()).map((item: { id: string }) => item.id)).toEqual([
      "org_1",
    ])

    const otherTenant = await app.handle(
      jsonRequest("/todos?organizationId=org_2", {
        userId: "user_1",
        activeOrganizationId: "org_2",
      })
    )
    const nonexistent = await app.handle(
      jsonRequest("/todos?organizationId=org_missing", {
        userId: "user_1",
        activeOrganizationId: "org_missing",
      })
    )
    expect(otherTenant.status).toBe(404)
    expect(nonexistent.status).toBe(404)
    expect(await otherTenant.json()).toMatchObject({
      error: { code: "not_found", context: { resource: "organization" } },
    })
    expect(await nonexistent.json()).toMatchObject({
      error: { code: "not_found", context: { resource: "organization" } },
    })
  })

  it("requires the requested member tenant to be active", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/todos?organizationId=org_2", {
        userId: "user_5",
        activeOrganizationId: "org_1",
      })
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe(
      "active_organization_mismatch"
    )
  })

  it("repairs stale real-session organization context and persists the result", async () => {
    const db = await createSeededDb()
    await db
      .update(schema.session)
      .set({ activeOrganizationId: "org_2" })
      .where(eq(schema.session.id, "session_1"))

    await expect(
      resolveAndPersistActiveOrganizationId(db, {
        sessionId: "session_1",
        userId: "user_1",
        activeOrganizationId: "org_2",
      })
    ).resolves.toBe("org_1")

    const stored = await db
      .select({ activeOrganizationId: schema.session.activeOrganizationId })
      .from(schema.session)
      .where(eq(schema.session.id, "session_1"))
    expect(stored[0]?.activeOrganizationId).toBe("org_1")
  })

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
    expect(await duplicateCreate.json()).toMatchObject({
      error: {
        code: "conflict",
        context: { constraint: "unique", field: "slug" },
      },
    })

    const duplicateUpdate = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "PATCH",
        userId: "user_1",
        body: { slug: "org-two" },
      })
    )
    expect(duplicateUpdate.status).toBe(409)
  })

  it("returns 403 when an admin attempts a super-admin-only role change", async () => {
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
      error: {
        code: "step_up_required",
        context: {
          action: "organization.member.role_update",
          maxAgeSeconds: 900,
        },
      },
    })
  })

  it("transfers ownership atomically and keeps one super admin", async () => {
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
    expect((await wrong.json()).error.code).toBe("confirmation_required")

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
      members.filter((item: { role: string }) => item.role === "super_admin")
    ).toHaveLength(1)
    expect(
      members.find((item: { id: string }) => item.id === "member_4").role
    ).toBe("super_admin")

    const audits = await db.select().from(schema.auditLogs)
    expect(
      audits.some(
        (event) => event.action === "organization.super_admin.transferred"
      )
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

  it("prevents admin invitations from granting admin", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const forbidden = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { email: "new@example.test", role: "admin" },
      })
    )
    expect(forbidden.status).toBe(403)

    const allowed = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { email: "new@example.test", role: "member" },
      })
    )
    expect(allowed.status).toBe(201)
    const createdInvitation = await allowed.json()

    const duplicate = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { email: "new@example.test", role: "member" },
      })
    )
    expect(duplicate.status).toBe(409)

    const existingMember = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { email: "user4@example.test", role: "member" },
      })
    )
    expect(existingMember.status).toBe(409)

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
    const replacement = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_3",
        body: { email: "expired@example.test", role: "member" },
      })
    )
    expect(replacement.status).toBe(201)
    const expiredRows = await db
      .select()
      .from(schema.invitation)
      .where(sql`${schema.invitation.id} = 'expired_invitation'`)
    expect(expiredRows[0]?.status).toBe("expired")

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

  it("serializes concurrent duplicate invitations", async () => {
    const app = createApp(await createSeededDb())
    const responses = await Promise.all(
      ["first", "second"].map(() =>
        app.handle(
          jsonRequest("/organizations/org_1/invitations", {
            method: "POST",
            userId: "user_3",
            body: { email: "race@example.test", role: "member" },
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
  })

  it("requires step-up when a super admin grants admin by invitation", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/organizations/org_1/invitations", {
        method: "POST",
        userId: "user_1",
        fresh: false,
        body: { email: "new-admin@example.test", role: "admin" },
      })
    )
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe("step_up_required")
  })
})

describe("issue-like todos", () => {
  it("creates, filters, updates, loads, and comments on an issue", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const createResponse = await app.handle(
      jsonRequest("/todos", {
        method: "POST",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          title: " Login bug ",
          description: "OAuth callback fails",
          priority: "urgent",
          assigneeId: "user_4",
          labels: ["bug", "auth"],
        },
      })
    )
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({ number: 2, title: "Login bug" })

    const filtered = await app.handle(
      jsonRequest(
        "/todos?organizationId=org_1&search=OAuth&priority=urgent&label=auth&sortBy=number&sortDirection=asc",
        { userId: "user_1" }
      )
    )
    expect(await filtered.json()).toEqual([
      expect.objectContaining({ id: created.id }),
    ])

    const update = await app.handle(
      jsonRequest(`/todos/${created.id}`, {
        method: "PATCH",
        userId: "user_1",
        body: { organizationId: "org_1", status: "in_progress" },
      })
    )
    expect(await update.json()).toMatchObject({ status: "in_progress" })

    const detail = await app.handle(
      jsonRequest(`/todos/${created.id}?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(detail.status).toBe(200)

    const comment = await app.handle(
      jsonRequest(`/todos/${created.id}/comments`, {
        method: "POST",
        userId: "user_4",
        body: { organizationId: "org_1", body: "I can reproduce this." },
      })
    )
    expect(comment.status).toBe(201)
    expect(await comment.json()).toMatchObject({
      authorId: "user_4",
      author: { id: "user_4", name: "User 4", image: null },
    })

    const audit = await app.handle(
      jsonRequest("/organizations/org_1/audit-logs?limit=100", {
        userId: "user_3",
      })
    )
    expect(
      (await audit.json()).map((event: { action: string }) => event.action)
    ).toEqual(
      expect.arrayContaining([
        "todo.created",
        "todo.updated",
        "todo.comment.created",
      ])
    )
  })

  it("allocates unique organization-local numbers under concurrent creates", async () => {
    const app = createApp(await createSeededDb())
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        app.handle(
          jsonRequest("/todos", {
            method: "POST",
            userId: "user_1",
            body: { organizationId: "org_1", title: `Concurrent ${index}` },
          })
        )
      )
    )
    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 201, 201, 201,
    ])
    const numbers = await Promise.all(
      responses.map(async (response) => (await response.json()).number)
    )
    expect(new Set(numbers).size).toBe(5)
  })

  it("does not attach a comment through a different tenant context", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const response = await app.handle(
      jsonRequest("/todos/todo_1/comments", {
        method: "POST",
        userId: "user_5",
        activeOrganizationId: "org_2",
        body: { organizationId: "org_2", body: "cross tenant" },
      })
    )
    expect(response.status).toBe(404)
    expect((await response.json()).error).toMatchObject({
      code: "not_found",
      context: { resource: "todo" },
    })
    expect(await db.select().from(schema.todoComments)).toHaveLength(0)
  })

  it("does not expose an author profile outside the comment tenant", async () => {
    const db = await createSeededDb()
    await db.insert(schema.todoComments).values({
      id: "comment_cross_tenant_author",
      todoId: "todo_1",
      organizationId: "org_1",
      authorId: "user_2",
      body: "Historical comment",
    })
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/todos/todo_1/comments?organizationId=org_1", {
        userId: "user_1",
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        authorId: "user_2",
        author: { id: "user_2", name: "Former member", image: null },
      }),
    ])
  })

  it("does not leak secret-looking unknown errors", async () => {
    const app = createApp(testDb()).get("/_test/boom", () => {
      throw new Error("TURSO_AUTH_TOKEN=super-secret-value")
    })
    const response = await app.handle(
      new Request("http://localhost/_test/boom", {
        headers: { "x-request-id": "req_test" },
      })
    )
    const body = await response.text()
    expect(response.status).toBe(500)
    expect(body).toContain("Internal server error")
    expect(body).toContain("req_test")
    expect(body).not.toContain("super-secret-value")
  })
})
