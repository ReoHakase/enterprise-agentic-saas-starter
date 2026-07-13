import { describe, expect, it } from "vitest"

import {
  normalizeTelemetryPath,
  scrubSentryEvent,
  scrubSentryLog,
  scrubSentrySpan,
} from "./sanitize"

describe("Sentry telemetry sanitizer", () => {
  it("request data and identity informationをeventから除去する", () => {
    const event = scrubSentryEvent({
      breadcrumbs: [{ message: "secret breadcrumb" }],
      contexts: {
        runtime: { name: "bun" },
        request: { city: "Tokyo", organizationId: "org_123" },
      },
      exception: {
        values: [{ type: "LibsqlError", value: "SELECT * FROM users" }],
      },
      extra: { sql: "SELECT * FROM users" },
      request: {
        cookies: { session: "secret" },
        data: { password: "secret" },
        headers: { authorization: "Bearer secret" },
        method: "GET",
        query_string: "email=person@example.com",
        url: "https://api.example.com/todos/123?token=secret",
      },
      tags: { request_id: "req_safe", userId: "user_123" },
      transaction: "GET /todos/123",
      user: { id: "user_123" },
    })

    expect(event.user).toBeUndefined()
    expect(event.extra).toBeUndefined()
    expect(event.breadcrumbs).toEqual([])
    expect(event.request).toEqual({ method: "GET" })
    expect(event.exception.values?.[0]?.value).toBe("LibsqlError")
    expect(event.tags).toEqual({
      request_id: "req_safe",
      userId: "[REDACTED]",
    })
    expect(event.contexts).toEqual({
      runtime: { name: "bun" },
      request: {
        city: "[REDACTED]",
        organizationId: "[REDACTED]",
      },
    })
    expect(event.transaction).toBe("GET /todos/:id")
  })

  it("structured logのsafe fieldだけを保持する", () => {
    const log = scrubSentryLog({
      attributes: {
        http_route: "/todos/:todoId",
        http_status_code: 500,
        request_id: "req_safe",
        sql: "SELECT * FROM users",
        userId: "user_123",
      },
      message: "HTTP request completed",
    })

    expect(log).toEqual({
      attributes: {
        http_route: "/todos/:todoId",
        http_status_code: 500,
        request_id: "req_safe",
        sql: "[REDACTED]",
        userId: "[REDACTED]",
      },
      message: "HTTP request completed",
    })
  })

  it("SQL spanのstatementとdescriptionを除去する", () => {
    const span = scrubSentrySpan({
      data: {
        "db.statement": "SELECT * FROM users WHERE email = ?",
        "server.address": "db.example.com",
      },
      description: "SELECT * FROM users WHERE email = ?",
      op: "db.query",
    })

    expect(span).toEqual({
      data: {
        "db.statement": "[REDACTED]",
        "server.address": "[REDACTED]",
      },
      description: "database query",
      op: "db.query",
    })
  })

  it("dynamic path segmentを安定したroute名にする", () => {
    expect(
      normalizeTelemetryPath(
        "/organizations/019f5bd6-a9fa-76a2-ac4f-1be5912668be/todos/42"
      )
    ).toBe("/organizations/:id/todos/:id")
    expect(normalizeTelemetryPath("/organizations/acme/todos/todo_1")).toBe(
      "/organizations/:id/todos/:id"
    )
  })

  it("span attributeのURLからqueryとdynamic pathを除去する", () => {
    const span = scrubSentrySpan({
      data: {
        "http.request.header.x-request-id": "private header value",
        "url.full":
          "https://api.example.com/todos/019f5bd6-a9fa-76a2-ac4f-1be5912668be?search=private",
      },
      description: "outbound request",
      op: "http.client",
    })

    expect(span.data["url.full"]).toBe("[REDACTED]")
    expect(span.data["http.request.header.x-request-id"]).toBe("[REDACTED]")
    expect(span.description).toBe("HTTP request")
  })

  it("Basic credentialとdatabase URLをfree-textから除去する", () => {
    const basic = scrubSentryLog({
      message: "Authorization: Basic dXNlcjpwYXNzd29yZA==",
    })
    const database = scrubSentryLog({
      message: "postgresql://user:password@db.example.com/app",
    })

    expect(basic.message).toBe("[REDACTED]")
    expect(database.message).toBe("[REDACTED]")
  })
})
