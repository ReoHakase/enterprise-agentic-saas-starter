import { describe, expect, it } from "vitest"

import { rewriteOrganizationSwitchPathname } from "./organization-switch-route"

describe("rewriteOrganizationSwitchPathnameの契約", () => {
  it.each(["dashboard", "issues", "members", "settings"])(
    "切替先組織の正規%sルートへ書き換える",
    (route) => {
      expect(
        rewriteOrganizationSwitchPathname(`/organization/acme/${route}`, "beta")
      ).toBe(`/organization/beta/${route}`)
    }
  )

  it("廃止済みAgentルートは書き換えない", () => {
    expect(
      rewriteOrganizationSwitchPathname("/organization/acme/agent", "beta")
    ).toBe("/organization/acme/agent")
  })
})
