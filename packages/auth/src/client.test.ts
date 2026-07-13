import { describe, expect, it } from "vitest"

import { createAuthClientForBaseUrl } from "./client"

describe("auth client plugins", () => {
  it("exposes account switching through the official multi-session client", () => {
    const client = createAuthClientForBaseUrl("https://api.example.test")

    expect(client.multiSession.listDeviceSessions).toBeTypeOf("function")
    expect(client.multiSession.setActive).toBeTypeOf("function")
    expect(client.multiSession.revoke).toBeTypeOf("function")
  })
})
