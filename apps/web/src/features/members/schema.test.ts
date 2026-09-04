import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { invitationFormSchema, normalizeInvitationEmail } from "./schema"

describe("招待入力schema", () => {
  it("1件の招待先メールアドレスを正規化する", () => {
    expect(normalizeInvitationEmail(" First@Example.com ")).toBe(
      "first@example.com"
    )
  })

  it("1件のメールアドレスを受け入れ、複数件を拒否する", () => {
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
