import { describe, expect, it } from "vitest"

import {
  parseDeviceAccounts,
  parseLinkedAccounts,
  parseUserPasskeys,
} from "./schema"

describe("アカウント表示スキーマ", () => {
  it("有効なBetter AuthセッションのWeb画像フィールドを写像する", () => {
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
    {
      caseLabel: "無効なメールアドレス",
      email: "not-an-email",
      id: "user-1",
    },
    {
      caseLabel: "利用者IDの欠落",
      email: "reo@example.test",
      id: undefined,
    },
  ])("デバイスアカウントに$caseLabelがある場合は拒否する", ({ email, id }) => {
    expect(() =>
      parseDeviceAccounts([
        {
          session: { token: "session-1" },
          user: { id, name: "Reo", email, image: null },
        },
      ])
    ).toThrow("Invalid")
  })

  it("連携アカウントIDがない場合はレスポンスを拒否する", () => {
    expect(() => parseLinkedAccounts([{ providerId: "github" }])).toThrow(
      "Invalid"
    )
  })

  it("パスキーIDがない場合はレスポンスを拒否する", () => {
    expect(() => parseUserPasskeys([{ name: "MacBook" }])).toThrow("Invalid")
  })

  it("未知のレスポンス形式を拒否する", () => {
    expect(() => parseDeviceAccounts({ accounts: [] })).toThrow("Invalid")
  })
})
