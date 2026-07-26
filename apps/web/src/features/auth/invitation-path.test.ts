import { describe, expect, it } from "vitest"

import { createInvitationPath } from "./invitation-path"

describe("invitation paths", () => {
  it("uses a public namespace that cannot collide with organization slugs", () => {
    expect(createInvitationPath("invitation/with spaces")).toBe(
      "/invitations/invitation%2Fwith%20spaces"
    )
  })
})
