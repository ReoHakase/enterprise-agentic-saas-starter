import { describe, expect, it } from "vitest"

import { sanitizeAuthRedirectTo } from "./redirect-to"

describe("sanitizeAuthRedirectTo", () => {
  it.each([
    "https://evil.example/phish",
    "//evil.example/phish",
    "/\\evil.example/phish",
    "/%2f%2fevil.example/phish",
    "/%252f%252fevil.example/phish",
    "/%5cevil.example/phish",
    "/%00dashboard",
  ])("rejects non-local redirect %s", (redirectTo) => {
    expect(sanitizeAuthRedirectTo(redirectTo)).toBe("/dashboard")
  })

  it("keeps a local path with query and hash", () => {
    expect(
      sanitizeAuthRedirectTo(
        "/organization/acme-operations/members?tab=pending#invite"
      )
    ).toBe("/organization/acme-operations/members?tab=pending#invite")
  })

  it("uses a configurable fallback for a missing value", () => {
    expect(sanitizeAuthRedirectTo(undefined, "/settings/account")).toBe(
      "/settings/account"
    )
  })
})
