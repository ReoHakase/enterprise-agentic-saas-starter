import { describe, expect, it } from "vitest"

import { parseSession } from "./auth-session-schema"

const session = {
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: "2026-07-17T00:00:00.000Z",
  },
  user: {
    id: "user-1",
    email: "member@example.com",
    name: "Member",
    image: "https://images.example.com/member.png",
  },
}

describe("parseSessionの契約", () => {
  it("認証済み利用者の任意プロフィール画像を保持する", () => {
    expect(parseSession(session)?.user.image).toBe(session.user.image)
  })

  it("無効なプロフィール画像値を拒否する", () => {
    expect(
      parseSession({
        ...session,
        user: { ...session.user, image: { url: session.user.image } },
      })
    ).toBeNull()
  })
})
