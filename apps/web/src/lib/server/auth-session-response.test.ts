import { describe, expect, it } from "vitest"

import { readAuthSessionResult } from "./auth-session-response"

describe("readAuthSessionResult", () => {
  it("treats only 401 as an unauthenticated session", () => {
    expect(
      readAuthSessionResult({ data: null, error: { status: 401 } })
    ).toBeNull()
  })

  it("surfaces an API outage to the route error boundary", () => {
    const error = { status: 503, message: "upstream unavailable" }
    expect(() => readAuthSessionResult({ data: null, error })).toThrow(error)
  })

  it("returns a successful session payload", () => {
    const session = { session: { id: "session-1" }, user: { id: "user-1" } }
    expect(readAuthSessionResult({ data: session, error: null })).toEqual(
      session
    )
  })
})
