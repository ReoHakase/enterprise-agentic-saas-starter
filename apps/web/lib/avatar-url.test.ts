import { describe, expect, it } from "vitest"

import { getSafeAvatarUrl } from "./avatar-url"

describe("getSafeAvatarUrl", () => {
  it("allows the deterministic DiceBear URL used by development seed", () => {
    const avatarUrl =
      "https://api.dicebear.com/10.x/lorelei/svg?seed=10000000-0000-4000-8000-000000000001"

    expect(getSafeAvatarUrl(avatarUrl)).toBe(avatarUrl)
  })

  it.each([
    "http://api.dicebear.com/10.x/lorelei/svg?seed=user-id",
    "https://avatars.example.test/user-id.png",
    "not-a-url",
  ])("rejects an unsafe avatar URL: %s", (avatarUrl) => {
    expect(getSafeAvatarUrl(avatarUrl)).toBeUndefined()
  })
})
