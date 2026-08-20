import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { organizationFormSchema } from "./schema"

describe("organizationFormSchema", () => {
  it("validates local shape without owning server-reserved slugs", () => {
    const trimmed = v.safeParse(organizationFormSchema, {
      name: "  Authentication Operations  ",
      slug: "  auth  ",
    })

    expect(trimmed).toMatchObject({
      success: true,
      output: {
        name: "Authentication Operations",
        slug: "auth",
      },
    })
    expect(
      v.safeParse(organizationFormSchema, {
        name: "Invitation Operations",
        slug: "invitations",
      }).success
    ).toBe(true)

    for (const slug of [
      "ab",
      "a".repeat(49),
      "Invalid Slug",
      "invalid--slug",
    ]) {
      expect(
        v.safeParse(organizationFormSchema, {
          name: "Authentication Operations",
          slug,
        }).success
      ).toBe(false)
    }
  })
})
