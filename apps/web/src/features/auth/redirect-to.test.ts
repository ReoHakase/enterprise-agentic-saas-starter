import { describe, expect, it } from "vitest"

import { sanitizeAuthRedirectTo } from "./redirect-to"

describe("sanitizeAuthRedirectToの契約", () => {
  it.each([
    "https://evil.example/phish",
    "//evil.example/phish",
    "/\\evil.example/phish",
    "/%2f%2fevil.example/phish",
    "/%252f%252fevil.example/phish",
    "/%5cevil.example/phish",
    "/%00dashboard",
  ])("外部へのredirectToを拒否する: %s", (redirectTo) => {
    expect(sanitizeAuthRedirectTo(redirectTo)).toBe("/dashboard")
  })

  it("queryとhashを含むローカルパスを保持する", () => {
    expect(
      sanitizeAuthRedirectTo(
        "/organization/acme-operations/members?tab=pending#invite"
      )
    ).toBe("/organization/acme-operations/members?tab=pending#invite")
  })

  it("値がない場合は設定された代替遷移先を使う", () => {
    expect(sanitizeAuthRedirectTo(undefined, "/settings/account")).toBe(
      "/settings/account"
    )
  })
})
