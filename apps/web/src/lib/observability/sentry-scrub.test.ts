import { describe, expect, it } from "vitest"

import {
  beforeSendSentryError,
  beforeSendSentryLog,
  scrubSentryBreadcrumb,
} from "./sentry-scrub"

describe("Sentry telemetry scrubbing", () => {
  it("removes request PII and tenant identifiers from errors", () => {
    const event = beforeSendSentryError({
      type: undefined,
      contexts: {
        operation: {
          organizationId: "org-secret",
          resource: "issue",
        },
      },
      extra: {
        email: "user@example.com",
        safeReason: "network failure",
      },
      request: {
        cookies: { session: "secret" },
        data: { password: "secret" },
        headers: { authorization: "Bearer secret" },
        method: "GET",
        query_string: "token=secret",
        url: "https://app.example.com/organization/org-secret/settings?token=secret",
      },
      user: {
        email: "user@example.com",
        id: "user-secret",
        ip_address: "192.0.2.1",
      },
    })

    expect(event.user).toBeUndefined()
    expect(event.request).toEqual({
      method: "GET",
      url: "https://app.example.com/organization/[organizationSlug]/settings",
    })
    expect(event.contexts?.operation?.organizationId).toBe("[redacted]")
    expect(event.contexts?.operation?.resource).toBe("issue")
    expect(event.extra?.email).toBe("[redacted]")
    expect(event.extra?.safeReason).toBe("network failure")
  })

  it("scrubs credentials, database URLs, emails, and identifiers from text", () => {
    const input =
      "Bearer abc libsql://db.example.com?authToken=secret user@example.com 123e4567-e89b-12d3-a456-426614174000"
    const output = String(
      beforeSendSentryLog({ level: "error", message: input }).message
    )

    expect(output).not.toContain("abc")
    expect(output).not.toContain("libsql://")
    expect(output).not.toContain("user@example.com")
    expect(output).not.toContain("123e4567-e89b-12d3-a456-426614174000")
  })

  it("drops input breadcrumbs and sanitizes structured logs", () => {
    expect(
      scrubSentryBreadcrumb({ category: "ui.input", message: "secret" })
    ).toBeNull()

    const log = beforeSendSentryLog({
      attributes: {
        issueId: "issue-secret",
        memberId: "member-secret",
        operation: "load-dashboard",
      },
      level: "error",
      message: "Failed for user@example.com",
    })

    expect(log.message).toBe("Failed for [redacted]")
    expect(log.attributes?.issueId).toBe("[redacted]")
    expect(log.attributes?.memberId).toBe("[redacted]")
    expect(log.attributes?.operation).toBe("load-dashboard")
  })
})
