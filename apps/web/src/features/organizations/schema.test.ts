import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { organizationFormSchema } from "./schema"

describe("organizationFormSchemaの契約", () => {
  it("組織名とslugの前後を除去する", () => {
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
  })

  it("サーバー予約slugをローカルでは許可する", () => {
    expect(
      v.safeParse(organizationFormSchema, {
        name: "Invitation Operations",
        slug: "invitations",
      }).success
    ).toBe(true)
  })

  it.each([
    { caseLabel: "短すぎる", slug: "ab" },
    { caseLabel: "長すぎる", slug: "a".repeat(49) },
    { caseLabel: "空白と大文字を含む", slug: "Invalid Slug" },
    { caseLabel: "連続hyphenを含む", slug: "invalid--slug" },
  ])("$caseLabelのslugを拒否する", ({ slug }) => {
    expect(
      v.safeParse(organizationFormSchema, {
        name: "Authentication Operations",
        slug,
      }).success
    ).toBe(false)
  })
})
