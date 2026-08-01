import { describe, expect, it } from "vitest"

import { httpError } from "@/test-support/http-error"

import {
  clearConsoleApiFieldError,
  getConsoleApiFieldError,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
  isStepUpRequiredError,
  presentConsoleApiError,
  shouldRetryConsoleQuery,
} from "./error"

describe("console API error presentation", () => {
  it("reads the native public status and code without wrapping the error", () => {
    const error = httpError(403, "step_up_required", {
      message: "Recent authentication is required.",
    })

    expect(isStepUpRequiredError(error)).toBe(true)
    expect(
      presentConsoleApiError(error, "The operation was not completed.").message
    ).toBe("Recent authentication is required.")
  })

  it("uses fixed action copy for server failures", () => {
    expect(
      presentConsoleApiError(
        httpError(500, "internal_error"),
        "The organization was not updated."
      )
    ).toEqual({
      description: "Try again. If the problem continues, contact support.",
      fieldErrors: {},
      message: "The organization was not updated.",
    })
  })

  it("never presents an arbitrary Error message", () => {
    expect(
      presentConsoleApiError(
        new Error("libsql://token@private.example.test"),
        "The issue could not be created."
      )
    ).toEqual({
      description: undefined,
      fieldErrors: {},
      message: "The issue could not be created.",
    })
  })

  it("presents only bounded public field errors from a 4xx response", () => {
    const error = httpError(400, "validation_error", {
      fieldErrors: {
        __proto__: ["unsafe"],
        name: ["Choose another name."],
        title: ["x".repeat(501)],
      },
      message: "Check the highlighted fields.",
    })

    expect(getConsoleApiFieldErrors(error)).toEqual({
      name: ["Choose another name."],
    })
    expect(getConsoleApiFieldError(error, "name")).toBe("Choose another name.")
    expect(presentConsoleApiError(error, "Request failed").message).toBe(
      "Check the highlighted fields."
    )
  })

  it("does not present server-controlled details for a 5xx response", () => {
    const error = httpError(500, "internal_error", {
      fieldErrors: { token: ["private"] },
      message: "provider token=private",
    })

    expect(presentConsoleApiError(error, "Request failed")).toEqual({
      description: "Try again. If the problem continues, contact support.",
      fieldErrors: {},
      message: "Request failed",
    })
  })

  it("handles throwing property access without replacing the error", () => {
    const error = new Proxy(new Error("provider detail"), {
      get() {
        throw new Error("getter failed")
      },
    })

    expect(isStepUpRequiredError(error)).toBe(false)
    expect(presentConsoleApiError(error, "Request failed").message).toBe(
      "Request failed"
    )
  })

  it("clears only the edited local field state", () => {
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
    const badRequest = httpError(400, "validation_error")
    const unavailable = httpError(503, "service_unavailable")

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
