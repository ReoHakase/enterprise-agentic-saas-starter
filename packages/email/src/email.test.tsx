import { describe, expect, it, vi } from "vitest"

import {
  createCloudflareEmailSender,
  createConsoleSender,
  createConfiguredEmailSender,
  createMailpitEmailSender,
  createNoopSender,
  MailpitConfigurationError,
  renderMagicLinkEmail,
  renderOrganizationInvitationEmail,
  renderVerificationEmail,
  resolveEmailFrom,
  resolveEmailProvider,
  resolveMailpitUrl,
} from "./index"

describe("email configuration", () => {
  it("uses a non-deliverable local address when EMAIL_FROM is omitted locally", () => {
    expect(resolveEmailFrom(undefined, "development")).toBe(
      "noreply@example.test"
    )
    expect(resolveEmailFrom("  ", "test")).toBe("noreply@example.test")
  })

  it("keeps EMAIL_FROM required in production", () => {
    expect(resolveEmailFrom(undefined, "production")).toBeUndefined()
    expect(resolveEmailFrom("auth@example.com", "production")).toBe(
      "auth@example.com"
    )
  })

  it("selects safe runtime-specific email providers by default", () => {
    expect(resolveEmailProvider(undefined, "development")).toBe("mailpit")
    expect(resolveEmailProvider("  ", undefined)).toBe("mailpit")
    expect(resolveEmailProvider(undefined, "test")).toBe("noop")
    expect(resolveEmailProvider(undefined, "production")).toBe("cloudflare")
    expect(resolveEmailProvider(" console ", "production")).toBe("console")
  })

  it("defaults the Mailpit URL only in local development", () => {
    expect(resolveMailpitUrl(undefined, "development")).toBe(
      "https://mailpit.enterprise-agentic-saas.localhost"
    )
    expect(resolveMailpitUrl("  ", undefined)).toBe(
      "https://mailpit.enterprise-agentic-saas.localhost"
    )
    expect(resolveMailpitUrl(undefined, "test")).toBeUndefined()
    expect(resolveMailpitUrl(undefined, "production")).toBeUndefined()
    expect(resolveMailpitUrl(" http://localhost:8025 ", "production")).toBe(
      "http://localhost:8025"
    )
  })
})

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
    subject: "Invitation to join Private Organization",
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
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      "Private Organization"
    )
    expect(JSON.stringify(logger.mock.calls)).not.toContain("token?secret=1")
    expect(JSON.stringify(logger.mock.calls)).not.toContain("user@example.com")
  })

  it("default console logger omits bodies, recipient, and renderProp values", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    try {
      await createConsoleSender()({
        to: "user@example.com",
        template: "magic_link",
        subject: "Invitation to join Private Organization",
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
      expect(payload).not.toHaveProperty("subject")
      expect(payload).not.toHaveProperty("textLength")
      expect(payload).not.toHaveProperty("htmlLength")
      expect(payload).not.toHaveProperty("renderPropKeys")
      expect(JSON.stringify(payload)).not.toContain("Private Organization")
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

  it("sends only the rendered transport fields to a local Mailpit inbox", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ID":"message_123"}'))

    await createMailpitEmailSender({
      baseUrl: "https://mailpit.enterprise-agentic-saas.localhost",
      from: "auth@example.com",
      fromName: "Enterprise Agentic SaaS",
      runtime: "development",
      fetch: request,
    })(input)

    expect(request).toHaveBeenCalledWith(
      "https://mailpit.enterprise-agentic-saas.localhost/api/v1/send",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: {
            Email: "auth@example.com",
            Name: "Enterprise Agentic SaaS",
          },
          To: [{ Email: "user@example.com" }],
          Subject: "Invitation to join Private Organization",
          Text: "Text",
          HTML: "<p>Text</p>",
          Tags: ["magic_link"],
        }),
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }
    )
    expect(JSON.stringify(request.mock.calls)).not.toContain("renderProps")
    expect(JSON.stringify(request.mock.calls)).not.toContain("token?secret=1")
  })

  it("omits optional Mailpit HTML and accepts a loopback URL", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(undefined, { status: 200 }))

    await createMailpitEmailSender({
      baseUrl: "http://127.0.0.1:8025/custom/path?ignored=yes",
      from: "auth@example.com",
      runtime: "development",
      fetch: request,
    })({ ...input, html: undefined })

    const options = request.mock.calls[0]?.[1]
    expect(request.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8025/api/v1/send")
    expect(JSON.parse(String(options?.body))).toEqual({
      From: { Email: "auth@example.com" },
      To: [{ Email: "user@example.com" }],
      Subject: "Invitation to join Private Organization",
      Text: "Text",
      Tags: ["magic_link"],
    })
  })

  it.each([
    "not a URL",
    "https://mailpit.example.com",
    "https://mailpit.localhost.example.com",
    "https://127.evil.example.com",
    "ftp://localhost/inbox",
    "http://user:secret@localhost:8025",
  ])("rejects a non-local Mailpit URL: %s", (baseUrl) => {
    expect(() =>
      createMailpitEmailSender({
        baseUrl,
        from: "auth@example.com",
        runtime: "development",
      })
    ).toThrow(MailpitConfigurationError)
  })

  it.each(["production", "test"] as const)(
    "rejects Mailpit in the %s runtime",
    (runtime) => {
      expect(() =>
        createMailpitEmailSender({
          baseUrl: "http://localhost:8025",
          from: "auth@example.com",
          runtime,
        })
      ).toThrow(/only in development/)
    }
  )

  it("selects Mailpit only with complete development configuration", async () => {
    expect(() =>
      createConfiguredEmailSender({
        provider: "mailpit",
        runtime: "development",
      })
    ).toThrow(/EMAIL_FROM and MAILPIT_URL are required/)

    expect(() =>
      createConfiguredEmailSender({
        provider: "mailpit",
        runtime: "production",
        from: "auth@example.com",
        mailpitUrl: "http://localhost:8025",
      })
    ).toThrow(/only in development/)

    expect(
      createConfiguredEmailSender({
        provider: "mailpit",
        runtime: "development",
        from: "auth@example.com",
        mailpitUrl: "http://localhost:8025",
      })
    ).toBeTypeOf("function")
  })

  it("maps Mailpit network failures without retaining provider details", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new Error(
          "provider failed for user@example.com at https://example.com/token=abc"
        )
      )
    const sender = createMailpitEmailSender({
      baseUrl: "http://localhost:8025",
      from: "auth@example.com",
      runtime: "development",
      fetch: request,
    })

    const delivery = sender(input)
    await expect(delivery).rejects.toMatchObject({
      name: "MailpitDeliveryError",
      message: "Local email delivery failed",
      code: "E_NETWORK",
      retryable: true,
    })
    await expect(delivery).rejects.not.toHaveProperty("cause")
    await expect(delivery).rejects.not.toHaveProperty("to")
    await expect(delivery).rejects.not.toHaveProperty("body")
  })

  it("maps Mailpit HTTP failures without reading the raw response", async () => {
    const response = new Response(
      "provider error containing user@example.com and token=abc",
      { status: 503 }
    )
    const text = vi.spyOn(response, "text")
    const request = vi.fn<typeof fetch>().mockResolvedValue(response)
    const sender = createMailpitEmailSender({
      baseUrl: "http://[::1]:8025",
      from: "auth@example.com",
      runtime: "development",
      fetch: request,
    })

    await expect(sender(input)).rejects.toMatchObject({
      name: "MailpitDeliveryError",
      message: "Local email delivery failed",
      code: "E_HTTP",
      retryable: true,
      status: 503,
    })
    expect(text).not.toHaveBeenCalled()
  })

  it("rejects a malformed Mailpit recipient before making a request", async () => {
    const request = vi.fn<typeof fetch>()
    const sender = createMailpitEmailSender({
      baseUrl: "http://localhost:8025",
      from: "auth@example.com",
      runtime: "development",
      fetch: request,
    })

    await expect(
      sender({ ...input, to: "not-an-email" })
    ).rejects.toMatchObject({
      name: "MailpitDeliveryError",
      message: "Local email delivery failed",
      code: "E_VALIDATION_ERROR",
      retryable: false,
      field: "to",
    })
    expect(request).not.toHaveBeenCalled()
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
      subject: "Invitation to join Private Organization",
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
