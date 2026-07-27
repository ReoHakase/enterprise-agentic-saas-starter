import { describe, expect, it } from "vitest"

import { rewriteOrganizationSwitchPathname } from "./organization-switch-route"

describe("rewriteOrganizationSwitchPathname", () => {
  it.each(["dashboard", "issues", "members", "settings"])(
    "rewrites the canonical %s route for the target organization",
    (route) => {
      expect(
        rewriteOrganizationSwitchPathname(`/organization/acme/${route}`, "beta")
      ).toBe(`/organization/beta/${route}`)
    }
  )

  it("does not rewrite the removed Agent route", () => {
    expect(
      rewriteOrganizationSwitchPathname("/organization/acme/agent", "beta")
    ).toBe("/organization/acme/agent")
  })
})
