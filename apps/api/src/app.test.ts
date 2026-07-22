import { createServer } from "node:http"

import * as schema from "@enterprise-agentic-saas/db/schema"
import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
  SendEmail,
} from "@enterprise-agentic-saas/email"
import { createClient } from "@libsql/client"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import * as v from "valibot"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

import { createApp } from "./app"
import { createApiClient } from "./client"
import { env } from "./env"
import { publicErrors } from "./errors/app-error"
import { issueTimelinePageModel } from "./modules/issues/model"
import {
  findInvitationForResend,
  resendInvitationById,
} from "./modules/organizations/repository"
import { deleteOrganization } from "./modules/organizations/service"
import { resolveAndPersistActiveOrganizationId } from "./modules/users/repository"
import { corsPlugin } from "./plugins/cors"

const testDb = () =>
  drizzle(createClient({ url: "file::memory:?cache=shared" }), { schema })

beforeEach(() => {
  invitationEmailRenderSpy.mockClear()
  invitationEmailSendSpy.mockReset()
  invitationEmailSendSpy.mockResolvedValue(undefined)
})

const createSeededDb = async () => {
  const db = testDb()
  await db.run(sql`pragma foreign_keys = off`)

  await Promise.all(
    [
      "agent_grants",
      "agent_connection_tickets",
      "agent_runs",
      "agent_threads",
      "agent_session_contexts",
      "organization_deletion_jobs",
      "invitation_email_jobs",
      "issue_activity_events",
      "issue_comments",
      "audit_logs",
      "issues",
      "invitation",
      "rate_limit",
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
      created_at integer not null,
      foreign key (organization_id) references organization(id) on delete cascade
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
      inviter_id text not null,
      foreign key (organization_id) references organization(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table invitation_email_jobs (
      id text primary key,
      invitation_id text not null unique,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      completed_at integer,
      foreign key (invitation_id) references invitation(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table rate_limit (
      id text primary key,
      key text not null unique,
      count integer not null,
      last_request integer not null
    )
  `)
  await db.run(sql`
    create table issues (
      id text primary key,
      organization_id text not null,
      number integer not null,
      revision integer not null default 1,
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
      foreign key (organization_id) references organization(id) on delete cascade,
      unique (organization_id, number)
    )
  `)
  await db.run(sql`
    create table issue_comments (
      id text primary key,
      issue_id text not null,
      organization_id text not null,
      author_id text not null,
      body text not null,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade,
      foreign key (issue_id) references issues(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table issue_activity_events (
      id text primary key,
      organization_id text not null,
      issue_id text not null,
      actor_user_id text,
      batch_id text not null,
      position integer not null default 0,
      kind text not null,
      field text,
      from_value text,
      to_value text,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade,
      foreign key (issue_id) references issues(id) on delete cascade
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
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table organization_deletion_jobs (
      id text primary key,
      organization_id text not null,
      requested_by_user_id text not null,
      idempotency_key text not null,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      requested_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      completed_at integer
    )
  `)
  await db.run(sql`
    create table agent_session_contexts (
      session_id text primary key,
      user_id text not null,
      context_epoch integer not null default 1,
      updated_at integer not null
    )
  `)
  await db.run(sql`
    create table agent_threads (
      id text primary key,
      organization_id text not null,
      owner_user_id text not null,
      title text not null,
      status text not null default 'active',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `)
  await db.run(sql`
    create table agent_runs (
      id text primary key,
      organization_id text not null,
      thread_id text not null,
      root_run_id text not null,
      parent_run_id text,
      resumed_action_id text,
      session_id text not null,
      user_id text not null,
      context_epoch integer not null,
      client_message_id text,
      status text not null default 'running',
      scope text not null default 'chat',
      step_count integer not null default 0,
      tool_count integer not null default 0,
      write_count integer not null default 0,
      input_token_count integer not null default 0,
      output_token_count integer not null default 0,
      started_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      expires_at integer not null,
      finished_at integer
    )
  `)
  await db.run(sql`
    create table agent_connection_tickets (
      id text primary key,
      token_hash text not null unique,
      organization_id text not null,
      thread_id text not null,
      session_id text not null,
      user_id text not null,
      context_epoch integer not null,
      issued_at integer not null,
      expires_at integer not null,
      consumed_at integer,
      revoked_at integer
    )
  `)
  await db.run(sql`
    create table agent_grants (
      id text primary key,
      token_hash text not null unique,
      kind text not null,
      organization_id text not null,
      thread_id text not null,
      run_id text,
      session_id text not null,
      user_id text not null,
      context_epoch integer not null,
      issued_at integer not null,
      expires_at integer not null,
      revoked_at integer
    )
  `)
  await db.run(sql`pragma foreign_keys = on`)
  await db.run(sql`
    create unique index organization_deletion_jobs_request_uidx
    on organization_deletion_jobs (requested_by_user_id, idempotency_key)
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
  await db.insert(schema.issues).values({
    id: "issue_1",
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
    sessionId?: string
  } = {}
) => ({
  ...(options.json === false ? {} : { "content-type": "application/json" }),
  "x-test-user-id": userId,
  "x-test-active-organization-id": options.activeOrganizationId ?? "org_1",
  ...(options.sessionId ? { "x-test-session-id": options.sessionId } : {}),
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
    sessionId?: string
  }
) =>
  new Request(`http://localhost${path}`, {
    method: input.method ?? "GET",
    headers: authHeaders(input.userId, {
      activeOrganizationId: input.activeOrganizationId,
      fresh: input.fresh,
      sessionId: input.sessionId,
    }),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

const startHttpServer = async (app: ReturnType<typeof createApp>) => {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Uint8Array[] = []
      for await (const chunk of incoming) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      }

      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) {
            headers.append(name, item)
          }
        }
      }

      const body =
        chunks.length > 0
          ? new Uint8Array(
              Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
            )
          : undefined
      const response = await app.handle(
        new Request(
          `http://${incoming.headers.host ?? "127.0.0.1"}${incoming.url ?? "/"}`,
          {
            method: incoming.method,
            headers,
            body,
          }
        )
      )

      outgoing.statusCode = response.status
      response.headers.forEach((value, name) => {
        outgoing.setHeader(name, value)
      })
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      outgoing.statusCode = 500
      outgoing.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Test HTTP server did not expose a TCP port")
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
    origin: `http://127.0.0.1:${address.port}`,
  }
}

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
    expect(
      getResponse.headers
        .get("access-control-expose-headers")
        ?.toLowerCase()
        .split(", ")
    ).toEqual(
      expect.arrayContaining(["server-timing", "x-request-id", "retry-after"])
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
    expect(spec.components.securitySchemes.apiKeyCookie).toMatchObject({
      in: "cookie",
      type: "apiKey",
    })
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      scheme: "bearer",
      type: "http",
    })
    expect(spec.components.schemas.AuthUser.properties.displayName).toEqual({
      nullable: true,
      type: "string",
    })
    expect(
      spec.paths["/auth/passkey/generate-register-options"].get.responses["200"]
        .content["application/json"].schema
    ).toEqual({
      allOf: [{ $ref: "#/components/schemas/AuthUser" }, { type: "object" }],
    })
    expect(spec.paths["/auth/sign-in/magic-link"].post.tags).toEqual([
      "Auth / Magic link",
    ])
    expect(
      spec.paths["/auth/multi-session/list-device-sessions"].get.operationId
    ).toBe("betterAuthGetAuthMultiSessionListDeviceSessions")
    expect(spec.paths["/auth/organization/accept-invitation"]).toBeDefined()
    expect(spec.paths["/auth/organization/list-user-invitations"]).toBeDefined()
    expect(spec.paths["/auth/organization/invite-member"]).toBeUndefined()
    expect(
      spec.paths["/organizations/{organizationId}/ownership-transfer"].post
        .security
    ).toEqual([{ sessionCookie: [] }])
    expect(
      spec.paths[
        "/organizations/{organizationId}/invitations/{invitationId}/resend"
      ].post
    ).toMatchObject({
      operationId: "resendOrganizationInvitation",
      security: [{ sessionCookie: [] }],
      responses: {
        200: expect.any(Object),
        403: expect.any(Object),
        404: expect.any(Object),
        409: expect.any(Object),
        429: expect.any(Object),
      },
    })
    expect(spec.paths["/issues/{id}"].get.operationId).toBe("getIssue")
    expect(spec.paths["/issues/by-number/{number}"].get.operationId).toBe(
      "getIssueByNumber"
    )
    expect(spec.paths["/issues/{id}/timeline"].get.operationId).toBe(
      "getIssueTimeline"
    )
    expect(
      spec.paths["/agent/threads/{threadId}/permission"].put
    ).toMatchObject({
      operationId: "putAgentThreadPermission",
      security: [{ sessionCookie: [] }],
      responses: { 200: expect.any(Object), 404: expect.any(Object) },
      parameters: expect.arrayContaining([
        expect.objectContaining({
          in: "path",
          name: "threadId",
          required: true,
        }),
      ]),
    })
    expect(spec.paths["/todos"]).toBeUndefined()
    expect(spec.paths["/todos/{id}"]).toBeUndefined()
    expect(
      spec.paths["/issues"].post.requestBody.content["application/json"].schema
        .properties.dueDate
    ).toMatchObject({ format: "date-time", nullable: true, type: "string" })
    expect(
      spec.paths["/issues"].get.parameters.find(
        (parameter: { name: string }) => parameter.name === "page"
      ).schema
    ).toMatchObject({ maximum: 100_000, minimum: 1, type: "integer" })
    const fileUploadContent =
      spec.paths[
        "/files/organizations/{organizationId}/owners/{ownerType}/{ownerId}"
      ].post.requestBody.content
    expect(Object.keys(fileUploadContent)).toEqual(["multipart/form-data"])
    expect(
      fileUploadContent["multipart/form-data"].schema.properties.file
    ).toEqual({ format: "binary", type: "string" })
    const createOrganizationResponses =
      spec.paths["/organizations"].post.responses
    expect(createOrganizationResponses["201"]).toBeDefined()
    expect(
      createOrganizationResponses["403"].content["application/json"].schema
        .properties.error.properties.code.examples
    ).toContain("csrf_origin_forbidden")
    expect(
      createOrganizationResponses["403"].content["application/json"].schema
        .properties.error.properties.fieldErrors
    ).toBeDefined()
    const documentedError =
      createOrganizationResponses["403"].content["application/json"].schema
        .properties.error
    expect(documentedError.required).toContain("requestId")
    expect(documentedError.properties.requestId).toMatchObject({
      type: "string",
    })
    expect(Object.keys(documentedError.properties.context.properties)).toEqual([
      "action",
      "constraint",
      "field",
      "maxAgeSeconds",
      "reason",
      "resource",
      "retryAfter",
    ])
    expect(
      documentedError.properties.context.properties.organizationId
    ).toBeUndefined()
    expect(
      spec.paths["/issues/{id}/comments"].post.responses["201"].content[
        "application/json"
      ].schema.properties.author.required
    ).toEqual(["id", "name", "profileImage"])
    const invitationOperation =
      spec.paths["/organizations/{organizationId}/invitations"].post
    expect(
      invitationOperation.requestBody.content["application/json"].schema
        .properties.emails
    ).toMatchObject({
      items: { format: "email", type: "string" },
      maxItems: 20,
      minItems: 1,
      type: "array",
    })
    expect(
      invitationOperation.responses["201"].content["application/json"]
    ).toMatchObject({
      schema: {
        properties: {
          delivery: { enum: ["queued"] },
          queuedCount: { maximum: 20, minimum: 1, type: "integer" },
        },
        required: ["invitations", "queuedCount", "delivery"],
      },
    })
    expect(invitationOperation.responses["429"]).toBeDefined()
    const deleteOrganizationOperation =
      spec.paths["/organizations/{organizationId}"].delete
    expect(deleteOrganizationOperation.security).toEqual([
      { sessionCookie: [] },
    ])
    expect(new Set(Object.keys(deleteOrganizationOperation.responses))).toEqual(
      new Set(["200", "400", "401", "403", "404", "409", "500"])
    )
    expect(
      deleteOrganizationOperation.requestBody.content["application/json"].schema
        .required
    ).toEqual(["slug", "confirmation", "idempotencyKey"])
    expect(
      deleteOrganizationOperation.responses["400"].content["application/json"]
        .schema.properties.error.properties.fieldErrors
    ).toBeDefined()

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

  it("serves Scalar without local auth persistence, telemetry, or agent upload", async () => {
    const app = createApp(testDb())
    const response = await app.handle(new Request("http://localhost/openapi"))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(html).toContain("@scalar/api-reference")
    expect(html).not.toContain("SwaggerUIBundle")
    expect(html).toContain('"agent":{"disabled":true}')
    expect(html).toContain('"persistAuth":false')
    expect(html).toContain('"showOperationId":true')
    expect(html).toContain('"telemetry":false')
    expect(html).toContain('"withDefaultFonts":false')
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
      jsonRequest("/issues?organizationId=org_2", {
        userId: "user_1",
        activeOrganizationId: "org_2",
      })
    )
    const nonexistent = await app.handle(
      jsonRequest("/issues?organizationId=org_missing", {
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
      jsonRequest("/issues?organizationId=org_2", {
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
    expect(await admin.json()).toMatchObject({
      error: {
        code: "forbidden",
        context: { action: "organization.delete" },
      },
    })

    const stale = await app.handle(
      jsonRequest("/organizations/org_1", {
        method: "DELETE",
        userId: "user_1",
        fresh: false,
        body: validBody,
      })
    )
    expect(stale.status).toBe(403)
    expect(await stale.json()).toMatchObject({
      error: {
        code: "step_up_required",
        context: { action: "organization.delete", maxAgeSeconds: 900 },
      },
    })

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
      error: {
        code: "confirmation_required",
        context: { action: "organization.delete", field: "slug" },
        fieldErrors: { slug: ["Confirmation does not match"] },
      },
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
    expect(invalidConfirmation).toMatchObject({
      error: {
        code: "validation_error",
        fieldErrors: { confirmation: ["Invalid value"] },
      },
    })
    expect(invalidKey).toMatchObject({
      error: {
        code: "validation_error",
        fieldErrors: { idempotencyKey: ["Invalid value"] },
      },
    })

    const otherTenant = await app.handle(
      jsonRequest("/organizations/org_2", {
        method: "DELETE",
        userId: "user_1",
        activeOrganizationId: "org_2",
        body: { ...validBody, slug: "org-two" },
      })
    )
    expect(otherTenant.status).toBe(404)
    expect(await otherTenant.json()).toMatchObject({
      error: { code: "not_found", context: { resource: "organization" } },
    })
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
    ).rejects.toMatchObject({
      code: "forbidden",
      publicContext: { action: "organization.delete" },
    })
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
    ).rejects.toMatchObject({
      code: "step_up_required",
      publicContext: { action: "organization.delete" },
    })
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: freshSession,
        confirmation: "delete",
      })
    ).rejects.toMatchObject({
      code: "confirmation_required",
      publicContext: { field: "confirmation" },
    })
    await expect(
      deleteOrganization(db, {
        ...input,
        userId: "user_1",
        session: freshSession,
        slug: "org-two",
      })
    ).rejects.toMatchObject({
      code: "confirmation_required",
      publicContext: { field: "slug" },
    })

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
    ).rejects.toMatchObject({
      code: "forbidden",
      publicContext: { action: "organization.delete" },
    })
    await db
      .update(schema.member)
      .set({ role: "super_admin" })
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
      role: "super_admin",
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
      error: {
        code: "step_up_required",
        context: { action: "organization.delete" },
      },
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
    expect(await collision.json()).toMatchObject({
      error: {
        code: "conflict",
        context: {
          constraint: "idempotency_key",
          field: "idempotencyKey",
        },
        fieldErrors: {
          idempotencyKey: ["Idempotency key has already been used"],
        },
      },
    })
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

describe("issue-like issues", () => {
  it("returns stable server-filtered Issue pages beyond the first ten rows", async () => {
    const db = await createSeededDb()
    const now = new Date("2026-07-22T00:00:00.000Z")
    await db.insert(schema.issues).values(
      Array.from({ length: 12 }, (_, index) => ({
        id: `paged-issue-${index + 2}`,
        organizationId: "org_1",
        number: index + 2,
        title: `Paged Issue ${index + 2}`,
        description: "server pagination fixture",
        status: "open" as const,
        priority: "medium" as const,
        creatorId: "user_1",
        labels: ["pagination"],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }))
    )
    const response = await createApp(db).handle(
      jsonRequest(
        "/issues?organizationId=org_1&sortBy=number&sortDirection=asc&page=2",
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      items: [
        expect.objectContaining({ number: 11 }),
        expect.objectContaining({ number: 12 }),
        expect.objectContaining({ number: 13 }),
      ],
      page: 2,
      pageSize: 10,
      total: 13,
    })
  })

  it("creates, filters, updates, loads, and comments on an issue", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const createResponse = await app.handle(
      jsonRequest("/issues", {
        method: "POST",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          title: " Login bug ",
          description: "OAuth callback fails",
          priority: "urgent",
          assigneeId: "user_4",
          labels: ["bug", "auth"],
          dueDate: "2026-08-15T10:30:00.000Z",
        },
      })
    )
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      number: 2,
      title: "Login bug",
      dueDate: "2026-08-15T10:30:00.000Z",
    })
    expect(typeof created.dueDate).toBe("string")

    const storedIssue = await db
      .select({ dueDate: schema.issues.dueDate })
      .from(schema.issues)
      .where(eq(schema.issues.id, created.id))
    expect(storedIssue[0]?.dueDate?.toISOString()).toBe(
      "2026-08-15T10:30:00.000Z"
    )

    const filtered = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&search=OAuth&priority=urgent&label=auth&sortBy=number&sortDirection=asc",
        { userId: "user_1" }
      )
    )
    expect(await filtered.json()).toMatchObject({
      items: [expect.objectContaining({ id: created.id })],
      page: 1,
      pageSize: 10,
      total: 1,
    })

    const update = await app.handle(
      jsonRequest(`/issues/${created.id}`, {
        method: "PATCH",
        userId: "user_1",
        body: { organizationId: "org_1", status: "in_progress" },
      })
    )
    expect(await update.json()).toMatchObject({ status: "in_progress" })

    const detail = await app.handle(
      jsonRequest(`/issues/${created.id}?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(detail.status).toBe(200)
    expect((await detail.json()).dueDate).toBe("2026-08-15T10:30:00.000Z")

    const comment = await app.handle(
      jsonRequest(`/issues/${created.id}/comments`, {
        method: "POST",
        userId: "user_4",
        body: { organizationId: "org_1", body: "I can reproduce this." },
      })
    )
    expect(comment.status).toBe(201)
    expect(await comment.json()).toMatchObject({
      authorId: "user_4",
      author: { id: "user_4", name: "User 4", profileImage: null },
    })

    const byNumber = await app.handle(
      jsonRequest(`/issues/by-number/${created.number}?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(byNumber.status).toBe(200)
    expect(await byNumber.json()).toMatchObject({ id: created.id, number: 2 })

    const timeline = await app.handle(
      jsonRequest(`/issues/${created.id}/timeline?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(timeline.status).toBe(200)
    const timelineBody = await timeline.json()
    expect(timelineBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "activity", kind: "created" }),
        expect.objectContaining({
          type: "activity",
          kind: "field_changed",
          field: "status",
          fromValue: "open",
          toValue: "in_progress",
        }),
        expect.objectContaining({
          type: "comment",
          body: "I can reproduce this.",
        }),
      ])
    )
    expect(
      timelineBody.items.filter(
        (item: { type: string }) => item.type === "comment"
      )
    ).toHaveLength(1)

    const audit = await app.handle(
      jsonRequest("/organizations/org_1/audit-logs?limit=100", {
        userId: "user_3",
      })
    )
    expect(
      (await audit.json()).map((event: { action: string }) => event.action)
    ).toEqual(
      expect.arrayContaining([
        "issue.created",
        "issue.updated",
        "issue.comment.created",
      ])
    )
  })

  it("paginates equal-timestamp timeline items without gaps or duplicates", async () => {
    const db = await createSeededDb()
    const createdAt = new Date("2026-07-17T03:00:00.000Z")
    await db.insert(schema.issueActivityEvents).values([
      {
        id: "activity-position-2",
        organizationId: "org_1",
        issueId: "issue_1",
        actorUserId: "user_1",
        batchId: "batch-equal-time",
        position: 2,
        kind: "field_changed",
        field: "priority",
        fromValue: "low",
        toValue: "high",
        createdAt,
      },
      {
        id: "activity-position-1",
        organizationId: "org_1",
        issueId: "issue_1",
        actorUserId: "user_1",
        batchId: "batch-equal-time",
        position: 1,
        kind: "field_changed",
        field: "status",
        fromValue: "open",
        toValue: "in_progress",
        createdAt,
      },
      {
        id: "shared-entry",
        organizationId: "org_1",
        issueId: "issue_1",
        actorUserId: "user_2",
        batchId: "batch-equal-time",
        position: 0,
        kind: "field_changed",
        field: "assignee",
        fromValue: null,
        toValue: "user_1",
        createdAt,
      },
    ])
    await db.insert(schema.issueComments).values([
      {
        id: "shared-entry",
        organizationId: "org_1",
        issueId: "issue_1",
        authorId: "user_1",
        body: "Same id as an activity",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "older-comment",
        organizationId: "org_1",
        issueId: "issue_1",
        authorId: "user_1",
        body: "Last in the total order",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    const app = createApp(db)
    const items: Array<{
      type: "activity" | "comment"
      id: string
      actor?: {
        id: string | null
        name: string
        profileImage: string | null
      }
    }> = []
    let cursor: string | null = null

    const loadPage = async (remainingPages: number): Promise<void> => {
      const query = new URLSearchParams({
        organizationId: "org_1",
        limit: "1",
      })
      if (cursor) query.set("cursor", cursor)
      const response = await app.handle(
        jsonRequest(`/issues/issue_1/timeline?${query}`, { userId: "user_1" })
      )
      expect(response.status).toBe(200)
      const page = v.parse(issueTimelinePageModel, await response.json())
      items.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) return
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(cursor).not.toContain(createdAt.toISOString())
      if (remainingPages <= 1) return
      await loadPage(remainingPages - 1)
    }
    await loadPage(6)

    expect(cursor).toBeNull()
    expect(items.map(({ id, type }) => `${type}:${id}`)).toEqual([
      "activity:activity-position-2",
      "activity:activity-position-1",
      "comment:shared-entry",
      "activity:shared-entry",
      "comment:older-comment",
    ])
    expect(new Set(items.map(({ id, type }) => `${type}:${id}`)).size).toBe(5)
    expect(
      items.find(
        (item) => item.type === "activity" && item.id === "shared-entry"
      )?.actor
    ).toEqual({ id: null, name: "Former member", profileImage: null })

    const malformed = await app.handle(
      jsonRequest(
        "/issues/issue_1/timeline?organizationId=org_1&cursor=not-a-cursor",
        { userId: "user_1" }
      )
    )
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({
      error: {
        code: "validation_error",
        message: "Invalid timeline cursor",
        context: { field: "cursor" },
      },
    })
  })

  it("keeps non-null date-time fields as strings over the real Eden HTTP transport", async () => {
    const app = createApp(await createSeededDb())
    const server = await startHttpServer(app)

    try {
      const client = createApiClient(server.origin, {
        headers: authHeaders("user_1"),
      })
      const response = await client.issues.post({
        organizationId: "org_1",
        title: "Date contract",
        dueDate: "2026-09-30T18:45:00.000Z",
      })

      expect(response.status).toBe(201)
      expect(response.error).toBeNull()
      expect(response.data).toMatchObject({
        dueDate: "2026-09-30T18:45:00.000Z",
      })
      expect(response.data?.dueDate).toBeTypeOf("string")
      expect(response.data?.createdAt).toBeTypeOf("string")
      expect(response.data?.updatedAt).toBeTypeOf("string")
    } finally {
      await server.close()
    }
  })

  it("returns safe field errors without reflecting invalid input", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/issues", {
        method: "POST",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          title: "",
          dueDate: "private-value-that-must-not-be-reflected",
        },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: {
        code: "validation_error",
        message: "Invalid request",
        fieldErrors: {
          title: ["Invalid value"],
          dueDate: ["Invalid value"],
        },
      },
    })
    expect(JSON.stringify(body)).not.toContain(
      "private-value-that-must-not-be-reflected"
    )

    const serviceValidation = await app.handle(
      jsonRequest("/issues", {
        method: "POST",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          title: "Tenant-scoped assignee",
          assigneeId: "user_2",
        },
      })
    )
    expect(await serviceValidation.json()).toMatchObject({
      error: {
        code: "validation_error",
        fieldErrors: {
          assigneeId: ["Assignee must be a member of the organization"],
        },
      },
    })
  })

  it("allocates unique organization-local numbers under concurrent creates", async () => {
    const app = createApp(await createSeededDb())
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        app.handle(
          jsonRequest("/issues", {
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
      jsonRequest("/issues/issue_1/comments", {
        method: "POST",
        userId: "user_5",
        activeOrganizationId: "org_2",
        body: { organizationId: "org_2", body: "cross tenant" },
      })
    )
    expect(response.status).toBe(404)
    expect((await response.json()).error).toMatchObject({
      code: "not_found",
      context: { resource: "issue" },
    })
    expect(await db.select().from(schema.issueComments)).toHaveLength(0)
  })

  it("does not expose an author profile outside the comment tenant", async () => {
    const db = await createSeededDb()
    await db.insert(schema.issueComments).values({
      id: "comment_cross_tenant_author",
      issueId: "issue_1",
      organizationId: "org_1",
      authorId: "user_2",
      body: "Historical comment",
    })
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/issues/issue_1/comments?organizationId=org_1", {
        userId: "user_1",
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        authorId: "user_2",
        author: {
          id: "user_2",
          name: "Former member",
          profileImage: null,
        },
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

  it("filters AppError context again at the HTTP boundary", async () => {
    const error = publicErrors.validation("Choose a valid email", {
      action: "invitation.create",
      field: "email",
    })
    Object.defineProperty(error, "publicContext", {
      value: {
        action: "invitation.create",
        field: "email",
        organizationId: "org_private",
        reason: "token=super-secret-value",
        retryAfter: -1,
      },
    })
    error.message = "TURSO_AUTH_TOKEN=super-secret-message"
    const app = createApp(testDb()).get("/_test/public-error", () => {
      throw error
    })

    const response = await app.handle(
      new Request("http://localhost/_test/public-error")
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: {
        code: "validation_error",
        context: { action: "invitation.create", field: "email" },
        fieldErrors: { email: ["Choose a valid email"] },
      },
    })
    expect(body.error.requestId).toBe(response.headers.get("x-request-id"))
    expect(JSON.stringify(body)).not.toMatch(
      /org_private|super-secret-message|super-secret-value|organizationId/
    )
  })
})
