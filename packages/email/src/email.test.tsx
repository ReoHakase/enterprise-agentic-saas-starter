import { describe, expect, it, vi } from "vitest"

import {
  createCloudflareEmailSender,
  createConsoleSender,
  createConfiguredEmailSender,
  createNoopSender,
  renderMagicLinkEmail,
  renderOrganizationInvitationEmail,
  renderVerificationEmail,
} from "./index"

describe("email rendering", () => {
  it("renders magic link html and plain text", async () => {
    const email = await renderMagicLinkEmail({
      appName: "Enterprise Agentic SaaS",
      url: "https://example.com/magic",
    })

    expect(email.subject).toBe(
      "Your secure sign-in link for Enterprise Agentic SaaS"
    )
    expect(email.template).toBe("magic_link")
    expect(email.html).toContain("https://example.com/magic")
    expect(email.html).toContain("Continue to your workspace")
    expect(email.html).toContain("background-color:#18181b")
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

    expect(email.subject).toBe("Invitation to join Acme")
    expect(email.template).toBe("organization_invitation")
    expect(email.html).toContain("Acme")
    expect(email.html).toContain("Review invitation")
    expect(email.text).toContain("https://example.com/invite")
    expect(email.renderProps).toEqual({
      appName: "Enterprise Agentic SaaS",
      organizationName: "Acme",
      invitationUrl: "https://example.com/invite",
      inviterName: "Reo",
    })
  })

  it("renders email verification with the shared application shell", async () => {
    const email = await renderVerificationEmail({
      appName: "Enterprise Agentic SaaS",
      url: "https://example.com/verify",
    })

    expect(email.subject).toBe("Verify your email for Enterprise Agentic SaaS")
    expect(email.template).toBe("verification")
    expect(email.html).toContain("Confirm this email address")
    expect(email.text).toContain("https://example.com/verify")
  })
})

describe("email senders", () => {
  const input = {
    to: "user@example.com",
    template: "magic_link" as const,
    subject: "Subject",
    text: "Text",
    html: "<p>Text</p>",
    renderProps: { appName: "App", url: "https://example.com/token?secret=1" },
  }

  it("supports a noop sender for tests", async () => {
    await expect(createNoopSender()(input)).resolves.toBeUndefined()
  })

  it("passes only sanitized metadata to the console sender logger", async () => {
    const logger = vi.fn()

    await createConsoleSender(logger)(input)

    expect(logger).toHaveBeenCalledWith({
      template: "magic_link",
      recipientDomain: "example.com",
      subject: "Subject",
      textLength: 4,
      htmlLength: 11,
      renderPropKeys: ["appName", "url"],
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain("token?secret=1")
    expect(JSON.stringify(logger.mock.calls)).not.toContain("user@example.com")
  })

  it("default console logger omits bodies, recipient, and renderProp values", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    try {
      await createConsoleSender()({
        to: "user@example.com",
        template: "magic_link",
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
          template: "magic_link",
          recipientDomain: "example.com",
          subject: "Subject",
          textLength: 9,
          htmlLength: 16,
          renderPropKeys: ["appName", "url"],
        })
      )
      const payload = spy.mock.calls[0]?.[1]
      if (!payload || typeof payload !== "object") {
        throw new Error("expected logger payload to be an object")
      }
      expect(payload).not.toHaveProperty("text")
      expect(payload).not.toHaveProperty("html")
      expect(payload).not.toHaveProperty("to")
      expect(payload).not.toHaveProperty("renderProps")
      expect(JSON.stringify(payload)).not.toContain("token=abc")
      expect(JSON.stringify(payload)).not.toContain("https://")
    } finally {
      spy.mockRestore()
    }
  })

  it("fails closed when the console provider is selected in production", () => {
    expect(() =>
      createConfiguredEmailSender({
        provider: "console",
        runtime: "production",
      })
    ).toThrow(/disabled in production/)
  })

  it("allows noop for an explicitly disabled production delivery path", async () => {
    await expect(
      createConfiguredEmailSender({ provider: "noop", runtime: "production" })(
        input
      )
    ).resolves.toBeUndefined()
  })

  it("sends only the rendered transport fields through Cloudflare", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "message_123" })
    const observe = vi.fn()

    await createCloudflareEmailSender({
      binding: { send },
      from: "auth@example.com",
      fromName: "Enterprise Agentic SaaS",
      observe,
    })(input)

    expect(send).toHaveBeenCalledWith({
      to: "user@example.com",
      from: {
        email: "auth@example.com",
        name: "Enterprise Agentic SaaS",
      },
      subject: "Subject",
      text: "Text",
      html: "<p>Text</p>",
    })
    expect(JSON.stringify(send.mock.calls)).not.toContain("token?secret=1")
    expect(observe).toHaveBeenCalledWith({
      status: "accepted",
      template: "magic_link",
      recipientDomain: "example.com",
      messageId: "message_123",
    })
  })

  it("maps Cloudflare failures to a sanitized retry policy", async () => {
    const send = vi.fn().mockRejectedValue({
      code: "E_RATE_LIMIT_EXCEEDED",
      message: "raw provider message containing user@example.com",
    })
    const observe = vi.fn()
    const sender = createCloudflareEmailSender({
      binding: { send },
      from: "auth@example.com",
      observe,
    })

    await expect(sender(input)).rejects.toEqual(
      expect.objectContaining({
        name: "EmailDeliveryError",
        message: "Email delivery failed",
        code: "E_RATE_LIMIT_EXCEEDED",
        retryable: true,
      })
    )
    expect(observe).toHaveBeenCalledWith({
      status: "failed",
      template: "magic_link",
      recipientDomain: "example.com",
      code: "E_RATE_LIMIT_EXCEEDED",
      retryable: true,
    })
    expect(JSON.stringify(observe.mock.calls)).not.toContain(
      "raw provider message"
    )
  })

  it("does not turn an accepted delivery into a failure when observation fails", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "message_123" })
    const sender = createCloudflareEmailSender({
      binding: { send },
      from: "auth@example.com",
      observe() {
        throw new Error("observer unavailable")
      },
    })

    await expect(sender(input)).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledOnce()
  })

  it("rejects malformed addresses before invoking the binding", async () => {
    const send = vi.fn()
    const sender = createCloudflareEmailSender({
      binding: { send },
      from: "auth@example.com",
    })

    await expect(
      sender({ ...input, to: "not-an-email" })
    ).rejects.toMatchObject({
      code: "E_VALIDATION_ERROR",
      field: "to",
    })
    expect(send).not.toHaveBeenCalled()
  })
})
