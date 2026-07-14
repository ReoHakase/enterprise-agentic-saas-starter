import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  bulkInvitationResponseSchema,
  invitationFormSchema,
  normalizeInvitationEmails,
} from "./schema"

describe("bulk invitation schema", () => {
  it("normalizes case, whitespace, commas, new lines, and duplicates", () => {
    expect(
      normalizeInvitationEmails(
        " First@Example.com, second@example.com\nfirst@example.com\n\n"
      )
    ).toEqual(["first@example.com", "second@example.com"])
  })

  it("counts raw non-empty tokens before duplicate removal", () => {
    const result = v.safeParse(invitationFormSchema, {
      emails: Array.from({ length: 21 }, () => "same@example.com").join(","),
      role: "member",
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error("Expected validation to fail")
    expect(result.issues.map((issue) => issue.message)).toContain(
      "Enter no more than 20 email addresses at a time."
    )
  })

  it("requires a token and caps each raw email at 254 characters", () => {
    const emptyResult = v.safeParse(invitationFormSchema, {
      emails: " , \n ",
      role: "member",
    })
    const longResult = v.safeParse(invitationFormSchema, {
      emails: `${"a".repeat(243)}@example.com`,
      role: "member",
    })

    expect(emptyResult.success).toBe(false)
    if (emptyResult.success) throw new Error("Expected validation to fail")
    expect(emptyResult.issues.map((issue) => issue.message)).toContain(
      "Enter at least one email address."
    )

    expect(longResult.success).toBe(false)
    if (longResult.success) throw new Error("Expected validation to fail")
    expect(longResult.issues.map((issue) => issue.message)).toContain(
      "Use 254 characters or fewer for each email address."
    )
  })

  it("rejects queued response counts that do not match invitation records", () => {
    const result = v.safeParse(bulkInvitationResponseSchema, {
      invitations: [],
      queuedCount: 1,
      delivery: "queued",
    })

    expect(result.success).toBe(false)
  })
})
