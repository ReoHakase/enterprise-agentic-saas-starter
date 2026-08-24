import { describe, expect, it } from "vitest"

import { createInvitationPath } from "./invitation-path"

describe("招待パス", () => {
  it("組織slugと衝突しない公開名前空間を使う", () => {
    expect(createInvitationPath("invitation/with spaces")).toBe(
      "/invitations/invitation%2Fwith%20spaces"
    )
  })
})
