import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  bulkInvitationResponseSchema,
  invitationFormSchema,
  normalizeInvitationEmails,
  organizationInvitationSchema,
  resendInvitationResponseSchema,
} from "./schema"

const invitation = {
  id: "invitation-1",
  email: "recipient@example.com",
  role: "member",
  status: "pending",
  organizationId: "org-1",
  inviterId: "user-1",
  inviter: {
    id: "user-1",
    name: "Inviter",
    email: "inviter@example.com",
    profileImage: null,
  },
  expiresAt: "2026-07-23T00:00:00.000Z",
  createdAt: "2026-07-16T00:00:00.000Z",
} as const

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

  it("requires a safe invitation status and nested inviter identity", () => {
    expect(v.safeParse(organizationInvitationSchema, invitation).success).toBe(
      true
    )
    expect(
      v.safeParse(organizationInvitationSchema, {
        ...invitation,
        status: "unknown",
      }).success
    ).toBe(false)
    const { inviter: _inviter, ...withoutInviter } = invitation
    expect(
      v.safeParse(organizationInvitationSchema, withoutInviter).success
    ).toBe(false)
  })

  it("parses resend revival metadata with the renewed invitation", () => {
    expect(
      v.parse(resendInvitationResponseSchema, {
        invitation,
        delivery: "queued",
        revived: true,
      })
    ).toMatchObject({ revived: true, invitation: { id: "invitation-1" } })
  })
})
