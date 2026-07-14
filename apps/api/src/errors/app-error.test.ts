import { describe, expect, it } from "vitest"

import { AppError, sanitizePublicErrorContext } from "./app-error"

describe("public API error context", () => {
  it("keeps only bounded recovery identifiers and non-negative integers", () => {
    const context = {
      action: "organization.member.remove",
      constraint: "unique",
      field: "email",
      maxAgeSeconds: 900,
      reason: "pending",
      resource: "invitation",
      retryAfter: 30,
      organizationId: "org_private",
    }

    expect(sanitizePublicErrorContext(context)).toEqual({
      action: "organization.member.remove",
      constraint: "unique",
      field: "email",
      maxAgeSeconds: 900,
      reason: "pending",
      resource: "invitation",
      retryAfter: 30,
    })
  })

  it("drops free text, accessors, invalid numbers, and unknown keys", () => {
    const context = {
      action: "organization.delete",
      field: "email@example.test",
      maxAgeSeconds: Number.NaN,
      retryAfter: -1,
      token: "super-secret-value",
    }
    Object.defineProperty(context, "reason", {
      enumerable: true,
      get: () => {
        throw new Error("must not read context accessors")
      },
    })

    expect(sanitizePublicErrorContext(context)).toEqual({
      action: "organization.delete",
    })
  })

  it("stores an immutable sanitized context on AppError", () => {
    const error = new AppError({
      code: "validation_error",
      publicMessage: "Invalid request",
      statusCode: 400,
      publicContext: {
        field: "email",
        retryAfter: Number.POSITIVE_INFINITY,
      },
    })

    expect(error.publicContext).toEqual({ field: "email" })
    expect(Object.isFrozen(error.publicContext)).toBe(true)
    expect(error.publicMessage).toBe("Invalid request")
    expect(Reflect.set(error, "publicMessage", "unsafe replacement")).toBe(
      false
    )
  })
})
