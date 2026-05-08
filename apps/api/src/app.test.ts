import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"

const testDb = () =>
  drizzle(createClient({ url: "file::memory:?cache=shared" }), { schema })

const createSeededDb = async () => {
  const db = drizzle(createClient({ url: "file::memory:?cache=shared" }), {
    schema,
  })

  await db.run(sql`drop table if exists todos`)
  await db.run(sql`drop table if exists invitation`)
  await db.run(sql`drop table if exists session`)
  await db.run(sql`drop table if exists member`)
  await db.run(sql`drop table if exists organization`)
  await db.run(sql`drop table if exists user`)

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
      title text not null,
      completed integer not null default 0,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `)

  const now = new Date()

  await db.insert(schema.user).values([
    {
      id: "user_1",
      name: "User One",
      email: "user1@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_2",
      name: "User Two",
      email: "user2@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_3",
      name: "User Three",
      email: "user3@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_4",
      name: "User Four",
      email: "user4@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(schema.organization).values([
    {
      id: "org_1",
      name: "Org One",
      slug: "org-one",
      createdAt: now,
    },
    {
      id: "org_2",
      name: "Org Two",
      slug: "org-two",
      createdAt: now,
    },
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
  ])

  await db.insert(schema.session).values([
    {
      id: "session_1",
      userId: "user_1",
      token: "token_1",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "org_1",
    },
    {
      id: "session_2",
      userId: "user_1",
      token: "token_2",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "org_1",
    },
  ])

  await db.insert(schema.todos).values({
    id: "todo_1",
    organizationId: "org_1",
    title: "Seed todo",
    completed: false,
    createdAt: now,
    updatedAt: now,
  })

  return db
}

describe("createApp", () => {
  it("responds to health checks", async () => {
    const app = createApp(testDb())

    const response = await app.handle(new Request("http://localhost/health"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok" })
  })

  it("serves OpenAPI json", async () => {
    const app = createApp(testDb())

    const response = await app.handle(
      new Request("http://localhost/openapi/json")
    )

    expect(response.status).toBe(200)
  })

  it("requires authentication for organizations", async () => {
    const app = createApp(await createSeededDb())

    const response = await app.handle(
      new Request("http://localhost/organizations")
    )

    expect(response.status).toBe(401)
  })

  it("lists organizations for the authenticated user", async () => {
    const app = createApp(await createSeededDb())

    const response = await app.handle(
      new Request("http://localhost/organizations", {
        headers: { "x-test-user-id": "user_1" },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        active: false,
        id: "org_1",
        memberCount: 3,
        name: "Org One",
        permissions: {
          canEditOrganization: true,
          canInviteMembers: true,
          canManageAdmins: true,
          canManageMembers: true,
          canTransferSuperAdmin: true,
        },
        role: "super_admin",
        slug: "org-one",
      },
    ])
  })

  it("returns the current user console context", async () => {
    const app = createApp(await createSeededDb())

    const response = await app.handle(
      new Request("http://localhost/me", {
        headers: {
          "x-test-user-id": "user_1",
          "x-test-active-organization-id": "org_1",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        activeOrganizationId: "org_1",
        user: expect.objectContaining({ id: "user_1" }),
      })
    )
  })

  it("keeps exactly one super admin when transferring ownership", async () => {
    const app = createApp(await createSeededDb())

    const response = await app.handle(
      new Request("http://localhost/organizations/org_1/members/member_3", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user_1",
        },
        body: JSON.stringify({ role: "super_admin" }),
      })
    )

    expect(response.status).toBe(200)
    const members = await response.json()
    expect(
      members.filter(
        (member: { role: string }) => member.role === "super_admin"
      )
    ).toHaveLength(1)
    expect(
      members.find((member: { id: string }) => member.id === "member_3")?.role
    ).toBe("super_admin")
  })

  it("blocks admin users from managing super admins", async () => {
    const app = createApp(await createSeededDb())

    const response = await app.handle(
      new Request("http://localhost/organizations/org_1/members/member_1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user_3",
        },
        body: JSON.stringify({ role: "member" }),
      })
    )

    expect(response.status).toBe(403)
  })

  it("blocks member users from organization mutations", async () => {
    const app = createApp(await createSeededDb())

    const response = await app.handle(
      new Request("http://localhost/organizations/org_1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user_4",
        },
        body: JSON.stringify({ name: "Renamed" }),
      })
    )

    expect(response.status).toBe(403)
  })

  it("keeps todos scoped to organization membership", async () => {
    const app = createApp(await createSeededDb())

    const forbiddenResponse = await app.handle(
      new Request("http://localhost/todos?organizationId=org_2", {
        headers: { "x-test-user-id": "user_1" },
      })
    )
    expect(forbiddenResponse.status).toBe(403)

    const response = await app.handle(
      new Request("http://localhost/todos?organizationId=org_1", {
        headers: { "x-test-user-id": "user_1" },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        id: "todo_1",
        organizationId: "org_1",
        title: "Seed todo",
        completed: false,
      }),
    ])
  })

  it("creates, updates, and deletes todos", async () => {
    const app = createApp(await createSeededDb())
    const headers = {
      "content-type": "application/json",
      "x-test-user-id": "user_1",
    }

    const createResponse = await app.handle(
      new Request("http://localhost/todos", {
        method: "POST",
        headers,
        body: JSON.stringify({
          organizationId: "org_1",
          title: " New todo ",
        }),
      })
    )
    expect(createResponse.status).toBe(200)

    const created = await createResponse.json()
    expect(created).toEqual(
      expect.objectContaining({
        organizationId: "org_1",
        title: "New todo",
        completed: false,
      })
    )

    const updateResponse = await app.handle(
      new Request(`http://localhost/todos/${created.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          organizationId: "org_1",
          completed: true,
        }),
      })
    )
    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json()).toEqual(
      expect.objectContaining({
        id: created.id,
        completed: true,
      })
    )

    const deleteResponse = await app.handle(
      new Request(`http://localhost/todos/${created.id}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ organizationId: "org_1" }),
      })
    )
    expect(deleteResponse.status).toBe(200)
    expect(await deleteResponse.json()).toEqual(
      expect.objectContaining({ id: created.id })
    )
  })

  it("mounts handler via .mount()", async () => {
    const app = createApp(testDb()).mount(async (request) =>
      Response.json({ pathname: new URL(request.url).pathname })
    )

    const response = await app.handle(new Request("http://localhost/auth/ping"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ pathname: "/auth/ping" })
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
    expect(body).not.toContain("TURSO_AUTH_TOKEN")
  })
})
