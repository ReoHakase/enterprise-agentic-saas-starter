import { describe, expect, it } from "vitest"

import { readAuthSessionResult } from "./auth-session-response"

describe("readAuthSessionResultの契約", () => {
  it("401 のみを未認証セッションとして扱う", () => {
    expect(
      readAuthSessionResult({ data: null, error: { status: 401 } })
    ).toBeNull()
  })

  it("API障害をルートError Boundaryへ伝える", () => {
    const error = { status: 503, message: "upstream unavailable" }
    expect(() => readAuthSessionResult({ data: null, error })).toThrow(error)
  })

  it("成功したセッション ペイロードを返す", () => {
    const session = { session: { id: "session-1" }, user: { id: "user-1" } }
    expect(readAuthSessionResult({ data: session, error: null })).toEqual(
      session
    )
  })
})
