import { describe, expect, it } from "vitest"

import {
  createInvitationPath,
  getLegacyInvitationRedirectPath,
} from "./invitation-path"

describe("invitation paths", () => {
  it("uses a public namespace that cannot collide with organization slugs", () => {
    expect(createInvitationPath("invitation/with spaces")).toBe(
      "/invitations/invitation%2Fwith%20spaces"
    )
  })

  it("redirects old email links but preserves a legacy invitations organization", () => {
    expect(
      getLegacyInvitationRedirectPath(
        "/organization/invitations/invitation-legacy"
      )
    ).toBe("/invitations/invitation-legacy")
    expect(
      getLegacyInvitationRedirectPath("/organization/invitations/members")
    ).toBeUndefined()
    expect(
      getLegacyInvitationRedirectPath("/organization/invitations/settings")
    ).toBeUndefined()
  })
})
