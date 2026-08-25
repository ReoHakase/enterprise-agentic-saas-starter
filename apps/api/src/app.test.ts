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

describe("createAppのsecurityとOpenAPI", () => {
  it("既存routeとmountしたAuth handlerへcredential付きCORSを適用する", async () => {
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

  it("Originがないまたは信頼できない安全でないrequestを拒否する", async () => {
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

  it("bearer protocol endpointを自身のauthenticationまで到達させる", async () => {
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

  it("health endpointを公開する", async () => {
    const app = createApp(testDb())
    const response = await app.handle(new Request("http://localhost/health"))

    expect(response.status).toBe(200)
  })

  it("/openapi/jsonでapplication所有のOpenAPI documentを公開する", async () => {
    const app = createApp(testDb())
    const response = await app.handle(
      new Request("http://localhost/openapi/json")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      info: { title: expect.stringContaining("API") },
    })
  })

  it("applicationとBetter Authを別sourceにしてScalarを公開する", async () => {
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

  it("未認証で保護routeへアクセスすると安全な401を返す", async () => {
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

  it("別テナントを一覧にも取得結果にも含めない", async () => {
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

  it("要求した所属テナントがactiveであることを要求する", async () => {
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

  it("古い実sessionのorganization contextを修復して永続化する", async () => {
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
