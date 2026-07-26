import { describe, expect, it } from "vitest"

import {
  getSafeProfileImageUrl,
  isFirstPartyProfileImageUrl,
} from "./profile-image-url"

const apiBaseUrl = "https://api.enterprise-agentic-saas.example"

describe("profile image URL boundary", () => {
  it("allows the deterministic DiceBear URL used by development seed", () => {
    const profileImageUrl =
      "https://api.dicebear.com/10.x/lorelei/svg?seed=10000000-0000-4000-8000-000000000001"

    expect(getSafeProfileImageUrl(profileImageUrl, apiBaseUrl)).toBe(
      profileImageUrl
    )
    expect(isFirstPartyProfileImageUrl(profileImageUrl, apiBaseUrl)).toBe(false)
  })

  it("resolves and identifies a first-party profile image route", () => {
    const profileImagePath =
      "/files/profile-images/users/user-1?v=profile-image-user-1-2"
    expect(getSafeProfileImageUrl(profileImagePath, apiBaseUrl)).toBe(
      "https://api.enterprise-agentic-saas.example/files/profile-images/users/user-1?v=profile-image-user-1-2"
    )
    expect(isFirstPartyProfileImageUrl(profileImagePath, apiBaseUrl)).toBe(true)
  })

  it.each([
    "http://127.0.0.1:3001",
    "http://api.enterprise-agentic-saas.localhost:3001",
  ])(
    "allows a first-party profile image on a local HTTP API: %s",
    (baseUrl) => {
      const profileImagePath = "/files/profile-images/users/user-1"
      expect(getSafeProfileImageUrl(profileImagePath, baseUrl)).toBe(
        `${baseUrl}${profileImagePath}`
      )
      expect(isFirstPartyProfileImageUrl(profileImagePath, baseUrl)).toBe(true)
    }
  )

  it("rejects a first-party profile image on a non-local HTTP API", () => {
    const baseUrl = "http://api.example.test"
    const profileImagePath = "/files/profile-images/users/user-1"
    expect(getSafeProfileImageUrl(profileImagePath, baseUrl)).toBeUndefined()
    expect(isFirstPartyProfileImageUrl(profileImagePath, baseUrl)).toBe(false)
  })

  it.each([
    "http://api.dicebear.com/10.x/lorelei/svg?seed=user-id",
    "https://user:password@avatars.githubusercontent.com/u/1?v=4",
    "https://avatars.example.test/user-id.png",
    "https://api.enterprise-agentic-saas.example/files/organizations/org-1",
    "not-a-url",
  ])("rejects an unsafe profile image URL: %s", (profileImageUrl) => {
    expect(getSafeProfileImageUrl(profileImageUrl, apiBaseUrl)).toBeUndefined()
  })

  it("rejects credentials embedded in the API base URL", () => {
    const credentialedBaseUrl =
      "https://user:password@api.enterprise-agentic-saas.example"
    const profileImagePath = "/files/profile-images/users/user-1"

    expect(
      getSafeProfileImageUrl(profileImagePath, credentialedBaseUrl)
    ).toBeUndefined()
    expect(
      isFirstPartyProfileImageUrl(profileImagePath, credentialedBaseUrl)
    ).toBe(false)
  })
})
