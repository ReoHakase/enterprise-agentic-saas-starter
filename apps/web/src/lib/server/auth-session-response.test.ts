import { describe, expect, it } from "vitest"

import { readAuthSessionResult } from "./auth-session-response"

describe("readAuthSessionResult", () => {
  it("treats only 401 as an unauthenticated session", () => {
    expect(
      readAuthSessionResult({ data: null, error: { status: 401 } })
    ).toBeNull()
  })

  it("surfaces an API outage to the route error boundary", () => {
    expect(() =>
      readAuthSessionResult({ data: null, error: { status: 503 } })
    ).toThrow("Session request failed with status 503")
    const error = (() => {
      try {
        readAuthSessionResult({ data: null, error: { status: 503 } })
      } catch (requestError) {
        return requestError
      }
    })()
    expect(error).toMatchObject({
      name: "AuthSessionRequestError",
      status: 503,
    })
  })

  it("returns a successful session payload", () => {
    const session = { session: { id: "session-1" }, user: { id: "user-1" } }
    expect(readAuthSessionResult({ data: session, error: null })).toEqual(
      session
    )
  })
})
