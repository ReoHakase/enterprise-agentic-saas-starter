import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  invitationFormSchema,
  normalizeInvitationEmail,
  parseInvitations,
  parseMembers,
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

describe("member and invitation schemas", () => {
  it.each([
    {
      expectedMessage: "githubLinked",
      field: "githubLinked",
      value: undefined,
    },
    { expectedMessage: "Invalid type", field: "githubLinked", value: "true" },
    {
      expectedMessage: "passkeyLinked",
      field: "passkeyLinked",
      value: undefined,
    },
    { expectedMessage: "Invalid type", field: "passkeyLinked", value: 1 },
  ] as const)(
    "rejects $field when its value is $value",
    ({ expectedMessage, field, value }) => {
      const member: Record<string, unknown> = {
        id: "member-1",
        userId: "user-1",
        name: "Member",
        email: "member@example.com",
        profileImage: null,
        githubLinked: true,
        passkeyLinked: false,
        role: "member",
        createdAt: "2026-07-16T00:00:00.000Z",
      }

      if (value === undefined) delete member[field]
      else member[field] = value

      expect(() => parseMembers([member])).toThrow(expectedMessage)
    }
  )

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

  it("requires a safe invitation status and nested inviter identity", () => {
    expect(parseInvitations([invitation])).toEqual([invitation])
    expect(() =>
      parseInvitations([{ ...invitation, status: "unknown" }])
    ).toThrow("Invalid type")
    const { inviter: _inviter, ...withoutInviter } = invitation
    expect(() => parseInvitations([withoutInviter])).toThrow(
      'Expected "inviter"'
    )
  })
})
