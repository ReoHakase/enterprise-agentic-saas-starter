import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { organizationFormSchema } from "./schema"

describe("organizationFormSchema", () => {
  it("allows a legacy invitations slug after moving the public invitation route", () => {
    expect(
      v.safeParse(organizationFormSchema, {
        name: "Invitation Operations",
        slug: "invitations",
      }).success
    ).toBe(true)
    expect(
      v.safeParse(organizationFormSchema, {
        name: "Authentication Operations",
        slug: "auth",
      }).success
    ).toBe(false)
  })
})
