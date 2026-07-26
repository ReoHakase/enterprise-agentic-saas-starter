import * as schema from "@enterprise-agentic-saas/db/schema"
import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
  SendEmail,
} from "@enterprise-agentic-saas/email"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "./app"
import {
  authHeaders,
  createSeededDb,
  jsonRequest,
  testDb,
} from "./app.test-support"
import { resolveAndPersistActiveOrganizationId } from "./modules/users/repository"
import { env } from "./platform/env"
import { corsPlugin } from "./platform/plugins/cors"

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
})
