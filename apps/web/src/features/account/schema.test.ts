import { describe, expect, it } from "vitest"

import {
  parseDeviceAccounts,
  parseLinkedAccounts,
  parseUserPasskeys,
} from "./schema"

describe("account display schemas", () => {
  it("Given valid Better Auth sessions, when parsed, then maps the Web image field", () => {
    expect(
      parseDeviceAccounts([
        {
          session: { token: "session-1" },
          user: {
            id: "user-1",
            name: "Reo",
            email: "reo@example.test",
            image: "https://example.test/profile.png",
          },
        },
      ])
    ).toEqual([
      {
        session: { token: "session-1" },
        user: {
          id: "user-1",
          name: "Reo",
          email: "reo@example.test",
          profileImage: "https://example.test/profile.png",
        },
      },
    ])
  })

  it.each([
    ["an invalid email", "not-an-email", "user-1"],
    ["a missing user ID", "reo@example.test", undefined],
  ])(
    "Given %s, when device accounts are parsed, then rejects the response",
    (_case, email, id) => {
      expect(() =>
        parseDeviceAccounts([
          {
            session: { token: "session-1" },
            user: { id, name: "Reo", email, image: null },
          },
        ])
      ).toThrow("Invalid")
    }
  )

  it("Given missing security method IDs, when parsed, then rejects both provider shapes", () => {
    expect(() => parseLinkedAccounts([{ providerId: "github" }])).toThrow(
      "Invalid"
    )
    expect(() => parseUserPasskeys([{ name: "MacBook" }])).toThrow("Invalid")
  })

  it("Given an unknown response shape, when parsed, then rejects the payload", () => {
    expect(() => parseDeviceAccounts({ accounts: [] })).toThrow("Invalid")
  })
})
