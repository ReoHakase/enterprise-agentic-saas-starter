import { describe, expect, it } from "vitest"

import { createAuthClientForBaseUrl } from "./client"

describe("auth client plugins", () => {
  it("exposes account switching through the official multi-session client", () => {
    const client = createAuthClientForBaseUrl("https://api.example.test")

    expect(client.multiSession.listDeviceSessions).toBeTypeOf("function")
    expect(client.multiSession.setActive).toBeTypeOf("function")
    expect(client.multiSession.revoke).toBeTypeOf("function")
  })

  it("keeps the core social sign-in and account-linking capabilities", () => {
    const client = createAuthClientForBaseUrl("https://api.example.test")

    expect(client.signIn.social).toBeTypeOf("function")
    expect(client.linkSocial).toBeTypeOf("function")
  })
})
