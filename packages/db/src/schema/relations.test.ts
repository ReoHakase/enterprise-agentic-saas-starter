import { describe, expect, it } from "vitest"

import { relations } from "./relations"

describe("schema relations", () => {
  it("keeps Better Auth and OAuth relations on overlapping tables", () => {
    expect(Object.keys(relations.user.relations).toSorted()).toEqual([
      "accounts",
      "invitations",
      "members",
      "oauthAccessTokens",
      "oauthClients",
      "oauthConsents",
      "oauthRefreshTokens",
      "passkeys",
      "sessions",
    ])
    expect(Object.keys(relations.session.relations).toSorted()).toEqual([
      "oauthAccessTokens",
      "oauthRefreshTokens",
      "user",
    ])
  })
})
