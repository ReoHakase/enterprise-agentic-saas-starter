import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { invitationFormSchema, normalizeInvitationEmail } from "./schema"

describe("invitation input schema", () => {
  it("normalizes one invitation address", () => {
    expect(normalizeInvitationEmail(" First@Example.com ")).toBe(
      "first@example.com"
    )
  })

  it("accepts one email address and rejects a list", () => {
    expect(
      v.safeParse(invitationFormSchema, {
        email: "member@example.com",
        role: "member",
      }).success
    ).toBe(true)
    expect(
      v.safeParse(invitationFormSchema, {
        email: "first@example.com,second@example.com",
        role: "member",
      }).success
    ).toBe(false)
  })
})
