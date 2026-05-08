import { describe, expect, it, vi } from "vitest"

import {
  createConsoleSender,
  createNoopSender,
  renderMagicLinkEmail,
  renderOrganizationInvitationEmail,
} from "./index"

describe("email rendering", () => {
  it("renders magic link html and plain text", async () => {
    const email = await renderMagicLinkEmail({
      appName: "Enterprise Agentic SaaS",
      url: "https://example.com/magic",
    })

    expect(email.subject).toBe("Sign in to Enterprise Agentic SaaS")
    expect(email.html).toContain("https://example.com/magic")
    expect(email.text).toContain("https://example.com/magic")
    expect(email.renderProps).toEqual({
      appName: "Enterprise Agentic SaaS",
      url: "https://example.com/magic",
    })
  })

  it("renders organization invitation html and plain text", async () => {
    const email = await renderOrganizationInvitationEmail({
      appName: "Enterprise Agentic SaaS",
      organizationName: "Acme",
      invitationUrl: "https://example.com/invite",
      inviterName: "Reo",
    })

    expect(email.subject).toBe("Join Acme")
    expect(email.html).toContain("Acme")
    expect(email.text).toContain("https://example.com/invite")
    expect(email.renderProps).toEqual({
      appName: "Enterprise Agentic SaaS",
      organizationName: "Acme",
      invitationUrl: "https://example.com/invite",
      inviterName: "Reo",
    })
  })
})

describe("email senders", () => {
  const input = {
    to: "user@example.com",
    subject: "Subject",
    text: "Text",
    html: "<p>Text</p>",
    renderProps: { appName: "App", url: "https://example.com/token?secret=1" },
  }

  it("supports a noop sender for tests", async () => {
    await expect(createNoopSender()(input)).resolves.toBeUndefined()
  })

  it("passes payloads to the console sender logger", async () => {
    const logger = vi.fn()

    await createConsoleSender(logger)(input)

    expect(logger).toHaveBeenCalledWith(input)
  })

  it("default console logger omits body text and html but keeps renderProps", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    try {
      await createConsoleSender()({
        to: "user@example.com",
        subject: "Subject",
        text: "Text body",
        html: "<p>Text body</p>",
        renderProps: {
          appName: "App",
          url: "https://example.com/magic?token=abc",
        },
      })
      expect(spy).toHaveBeenCalledWith(
        "email:send",
        expect.objectContaining({
          to: "user@example.com",
          subject: "Subject",
          textLength: 9,
          htmlLength: 16,
          renderProps: {
            appName: "App",
            url: "https://example.com/magic?token=abc",
          },
        })
      )
      const payload = spy.mock.calls[0]?.[1]
      if (!payload || typeof payload !== "object") {
        throw new Error("expected logger payload to be an object")
      }
      expect(payload).not.toHaveProperty("text")
      expect(payload).not.toHaveProperty("html")
    } finally {
      spy.mockRestore()
    }
  })
})
