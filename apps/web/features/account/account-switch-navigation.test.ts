import { describe, expect, it } from "vitest"

import { resolveAccountSwitchReturnTo } from "./account-switch-navigation"

describe("resolveAccountSwitchReturnTo", () => {
  it("keeps an explicit same-origin workflow return path", () => {
    expect(
      resolveAccountSwitchReturnTo("/invitations/invitation-1?from=switch#join")
    ).toBe("/invitations/invitation-1?from=switch#join")
  })

  it.each([
    "https://attacker.example/invitation",
    "//attacker.example/invitation",
    "/\\attacker.example/invitation",
    "/invitations/invitation-1\nLocation: https://attacker.example",
  ])("falls back for an unsafe return path: %s", (returnTo) => {
    expect(resolveAccountSwitchReturnTo(returnTo)).toBe("/dashboard")
  })
})
