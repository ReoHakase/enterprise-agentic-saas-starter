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
  })
})

describe("email senders", () => {
  const input = {
    to: "user@example.com",
    subject: "Subject",
    text: "Text",
    html: "<p>Text</p>",
  }

  it("supports a noop sender for tests", async () => {
    await expect(createNoopSender()(input)).resolves.toBeUndefined()
  })

  it("passes payloads to the console sender logger", async () => {
    const logger = vi.fn()

    await createConsoleSender(logger)(input)

    expect(logger).toHaveBeenCalledWith(input)
  })
})
