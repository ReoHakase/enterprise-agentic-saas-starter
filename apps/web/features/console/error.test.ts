import { describe, expect, it } from "vitest"

import {
  clearConsoleApiFieldError,
  ConsoleApiError,
  hasConsoleApiFieldError,
  presentConsoleApiError,
  shouldRetryConsoleQuery,
  toConsoleApiError,
} from "./error"

describe("console API error presentation", () => {
  it("keeps only validated public recovery fields", () => {
    const error = toConsoleApiError(
      {
        value: {
          error: {
            code: "validation_error",
            message: "Fix the highlighted fields",
            context: {
              field: "profile.name",
              retryAfter: 12,
              organizationId: "org-private",
            },
            fieldErrors: {
              "profile.name": ["Use a recognizable display name."],
              constructor: ["must not be used"],
              title: ["", "A".repeat(501)],
            },
            requestId: "req_01JQ8YF2J7Q0J2X8R8S3Q9M6P4",
          },
        },
      },
      400
    )

    expect(error).toMatchObject({
      code: "validation_error",
      context: { field: "profile.name", retryAfter: 12 },
      fieldErrors: {
        "profile.name": ["Use a recognizable display name."],
      },
      message: "Fix the highlighted fields",
      requestId: "req_01JQ8YF2J7Q0J2X8R8S3Q9M6P4",
      status: 400,
    })
  })

  it("uses the action fallback for internal failures and retains a reference", () => {
    const error = new ConsoleApiError({
      code: "internal_error",
      message: "Internal server error",
      requestId: "req_internal_01",
      status: 500,
    })

    expect(
      presentConsoleApiError(error, "The organization was not updated.")
    ).toEqual({
      description:
        "Try again. If the problem continues, contact support. Reference ID: req_internal_01",
      fieldErrors: {},
      message: "The organization was not updated.",
      requestId: "req_internal_01",
    })
  })

  it("keeps a service recovery message and retry timing", () => {
    const error = new ConsoleApiError({
      code: "service_unavailable",
      context: { retryAfter: 3 },
      message: "Email delivery is temporarily unavailable.",
      requestId: "req_service_01",
      status: 503,
    })

    expect(presentConsoleApiError(error, "Invitation failed.")).toEqual({
      description: "Try again in 3 seconds. Reference ID: req_service_01",
      fieldErrors: {},
      message: "Email delivery is temporarily unavailable.",
      requestId: "req_service_01",
    })
  })

  it("never presents an arbitrary Error message", () => {
    expect(
      presentConsoleApiError(
        new Error("libsql://token@private.example.test"),
        "The issue could not be created."
      )
    ).toEqual({
      description: "Check your connection and try again.",
      fieldErrors: {},
      message: "The issue could not be created.",
    })
  })

  it("drops malformed request IDs without losing the public message", () => {
    const error = toConsoleApiError(
      {
        error: {
          code: "conflict",
          message: "The record changed. Reload and retry.",
          requestId: "invalid request id with spaces",
        },
      },
      409
    )

    expect(error.message).toBe("The record changed. Reload and retry.")
    expect(error.requestId).toBeUndefined()
  })

  it("clears only the edited server field", () => {
    const fieldErrors = {
      name: ["Choose another name."],
      slug: ["Choose another slug."],
    }

    const nextFieldErrors = clearConsoleApiFieldError(fieldErrors, "name")

    expect(nextFieldErrors).toEqual({ slug: ["Choose another slug."] })
    expect(fieldErrors).toHaveProperty("name")
    expect(clearConsoleApiFieldError(nextFieldErrors, "missing")).toBe(
      nextFieldErrors
    )
    expect(hasConsoleApiFieldError(nextFieldErrors, ["name", "slug"])).toBe(
      true
    )
    expect(hasConsoleApiFieldError(nextFieldErrors, ["name"])).toBe(false)
  })

  it("retries network and server failures once but never retries API 4xx", () => {
    const badRequest = new ConsoleApiError({
      code: "validation_error",
      message: "Invalid request",
      status: 400,
    })
    const unavailable = new ConsoleApiError({
      code: "service_unavailable",
      message: "Service temporarily unavailable",
      status: 503,
    })

    expect(shouldRetryConsoleQuery(0, badRequest)).toBe(false)
    expect(shouldRetryConsoleQuery(0, unavailable)).toBe(true)
    expect(shouldRetryConsoleQuery(0, new TypeError("Failed to fetch"))).toBe(
      true
    )
    expect(shouldRetryConsoleQuery(1, unavailable)).toBe(false)
    expect(shouldRetryConsoleQuery(1, new TypeError("Failed to fetch"))).toBe(
      false
    )
  })
})
