import { describe, expect, it } from "vitest"

import {
  getSafeProfileImageUrl,
  isFirstPartyProfileImageUrl,
} from "./profile-image-url"

const apiBaseUrl = "https://api.enterprise-agentic-saas.example"

describe("プロフィール画像 URL 境界", () => {
  it("開発用初期データで使う決定的なDiceBear URLを許可する", () => {
    const profileImageUrl =
      "https://api.dicebear.com/10.x/lorelei/svg?seed=10000000-0000-4000-8000-000000000001"

    expect(getSafeProfileImageUrl(profileImageUrl, apiBaseUrl)).toBe(
      profileImageUrl
    )
    expect(isFirstPartyProfileImageUrl(profileImageUrl, apiBaseUrl)).toBe(false)
  })

  it("first-partyプロフィール画像ルートを解決・識別する", () => {
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
    "ローカルHTTP API %sでfirst-partyプロフィール画像を許可する",
    (baseUrl) => {
      const profileImagePath = "/files/profile-images/users/user-1"
      expect(getSafeProfileImageUrl(profileImagePath, baseUrl)).toBe(
        `${baseUrl}${profileImagePath}`
      )
      expect(isFirstPartyProfileImageUrl(profileImagePath, baseUrl)).toBe(true)
    }
  )

  it("非ローカルHTTP APIではfirst-partyプロフィール画像を拒否する", () => {
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
  ])("安全でないプロフィール画像URLを拒否する: %s", (profileImageUrl) => {
    expect(getSafeProfileImageUrl(profileImageUrl, apiBaseUrl)).toBeUndefined()
  })

  it("API ベース URL に埋め込まれた認証情報を拒否する", () => {
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
