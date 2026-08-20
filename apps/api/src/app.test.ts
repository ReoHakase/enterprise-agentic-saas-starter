import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

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
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "traceparent"
    )
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "tracestate"
    )
    expect(preflight.headers.get("access-control-allow-headers")).not.toContain(
      "sentry-trace"
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
      error: "csrf_origin_forbidden",
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
    expect(await untrusted.json()).toMatchObject({
      error: "csrf_origin_forbidden",
    })

    const trusted = await app.handle(
      jsonRequest("/organizations/org_1/activate", {
        method: "POST",
        userId: "user_1",
      })
    )
    expect(trusted.status).toBe(200)
  })

  it("allows bearer protocol endpoints to reach their own authentication", async () => {
    const app = createApp(testDb())
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        host: "localhost",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "csrf-test", version: "1.0.0" },
        },
      }),
    })
    const bearerHeaders = new Headers(request.headers)
    bearerHeaders.set("authorization", "Bearer mcp_at_disabled")
    const bearerRequest = new Request(request.clone(), {
      headers: bearerHeaders,
    })
    const response = await app.handle(request)

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(
      "/.well-known/oauth-protected-resource/mcp"
    )

    expect((await app.handle(bearerRequest)).status).toBe(401)
    expect(
      (
        await app.handle(
          new Request(
            "http://localhost/.well-known/oauth-protected-resource/mcp"
          )
        )
      ).status
    ).toBe(200)
    expect(
      (
        await app.handle(
          new Request(
            "http://localhost/.well-known/oauth-authorization-server/auth"
          )
        )
      ).status
    ).toBe(404)
  })

  it("serves health and an app-owned OpenAPI document", async () => {
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
    expect(Object.keys(spec.components.securitySchemes)).toEqual([
      "sessionCookie",
    ])
    expect(Object.keys(spec.paths)).not.toContainEqual(
      expect.stringMatching(/^\/auth(?:\/|$)/u)
    )
    expect(
      spec.paths["/organizations/{organizationId}/ownership-transfer"].post
        .security
    ).toEqual([{ sessionCookie: [] }])
    expect(spec.paths["/me/mcp-oauth/sessions"].get).toMatchObject({
      operationId: "listCurrentUserMcpOAuthCredentials",
      security: [{ sessionCookie: [] }],
      responses: { 200: expect.any(Object) },
    })
    expect(
      spec.paths["/me/mcp-oauth/sessions/{credentialId}"].delete
    ).toMatchObject({
      operationId: "revokeCurrentUserMcpOAuthCredential",
      security: [{ sessionCookie: [] }],
      parameters: expect.arrayContaining([
        expect.objectContaining({
          in: "path",
          name: "credentialId",
          required: true,
        }),
      ]),
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
    const documentedError =
      createOrganizationResponses["403"].content["application/json"].schema
    expect(documentedError.required).toEqual(["error", "message"])
    expect(documentedError.properties.error).toMatchObject({
      type: "string",
    })
    expect(documentedError.properties.error.examples).toContain(
      "csrf_origin_forbidden"
    )
    expect(Object.keys(documentedError.properties)).toEqual([
      "error",
      "message",
      "fieldErrors",
    ])
    expect(
      spec.paths["/issues/{id}/comments"].post.responses["201"].content[
        "application/json"
      ].schema.properties.author.required
    ).toEqual(["id", "name", "profileImage"])
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
        .schema.required
    ).toEqual(["error", "message"])

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

  it("serves Scalar with separate application and Better Auth sources", async () => {
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
    expect(html).toContain('"slug":"application-api"')
    expect(html).toContain('"url":"/openapi/json"')
    expect(html).toContain('"slug":"authentication-api"')
    expect(html).toContain('"url":"/auth/open-api/generate-schema"')
    expect(html).not.toContain('"url":"openapi/json"')
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
    expect(response.headers.get("x-request-id")).toBe("req_unauthorized")
    expect(await response.json()).toMatchObject({ error: "unauthorized" })
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
    expect(await otherTenant.json()).toMatchObject({ error: "not_found" })
    expect(await nonexistent.json()).toMatchObject({ error: "not_found" })
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
    expect((await response.json()).error).toBe("active_organization_mismatch")
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
