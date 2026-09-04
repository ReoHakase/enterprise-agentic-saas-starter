import { describe, expect, it } from "vitest"

import { resolveAccountSwitchReturnTo } from "./account-switch-return-to"

describe("resolveAccountSwitchReturnToの契約", () => {
  it("明示された同一オリジンの戻り先を保持する", () => {
    expect(
      resolveAccountSwitchReturnTo("/invitations/invitation-1?from=switch#join")
    ).toBe("/invitations/invitation-1?from=switch#join")
  })

  it.each([
    "https://attacker.example/invitation",
    "//attacker.example/invitation",
    "/\\attacker.example/invitation",
    "/invitations/invitation-1\nLocation: https://attacker.example",
  ])("安全でない戻り先では代替経路を使う: %s", (returnTo) => {
    expect(resolveAccountSwitchReturnTo(returnTo)).toBe("/dashboard")
  })
})
