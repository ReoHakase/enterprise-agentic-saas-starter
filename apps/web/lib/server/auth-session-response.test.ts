import { describe, expect, it } from "vitest"

import {
  AuthSessionRequestError,
  readAuthSessionResponse,
} from "./auth-session-response"

describe("readAuthSessionResponse", () => {
  it("treats only 401 as an unauthenticated session", async () => {
    await expect(
      readAuthSessionResponse(new Response(null, { status: 401 }))
    ).resolves.toBeNull()
  })

  it("surfaces an API outage to the route error boundary", async () => {
    await expect(
      readAuthSessionResponse(
        new Response(JSON.stringify({ error: "unavailable" }), { status: 503 })
      )
    ).rejects.toEqual(new AuthSessionRequestError(503))
  })

  it("returns a successful session payload", async () => {
    const session = { session: { id: "session-1" }, user: { id: "user-1" } }
    await expect(
      readAuthSessionResponse(Response.json(session))
    ).resolves.toEqual(session)
  })
})
