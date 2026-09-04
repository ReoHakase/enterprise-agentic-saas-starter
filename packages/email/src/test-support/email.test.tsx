import { describe, expect, it, vi } from "vitest"

import {
  renderMagicLinkEmail,
  renderOrganizationInvitationEmail,
  renderVerificationEmail,
  resolveEmailFrom,
  resolveEmailProvider,
  resolveMailpitUrl,
} from "../index"
import { createCloudflareEmailSender } from "../providers/cloudflare"
import { createConfiguredEmailSender } from "../providers/configured"
import { createConsoleSender } from "../providers/console"
import { createMailpitEmailSender } from "../providers/mailpit"
import { privateMailCommandFixture } from "./fixtures"

describe("メール設定", () => {
  it("localでEMAIL_FROMを省略した場合は配送不能なaddressを使う", () => {
    expect(resolveEmailFrom(undefined, "development")).toBe(
      "noreply@example.test"
    )
    expect(resolveEmailFrom("  ", "test")).toBe("noreply@example.test")
  })

  it("本番ではEMAIL_FROMを必須にする", () => {
    expect(resolveEmailFrom(undefined, "production")).toBeUndefined()
    expect(resolveEmailFrom("auth@example.com", "production")).toBe(
      "auth@example.com"
    )
  })

  it("runtimeごとに安全な既定email providerを選ぶ", () => {
    expect(resolveEmailProvider(undefined, "development")).toBe("mailpit")
    expect(resolveEmailProvider("  ", undefined)).toBe("mailpit")
    expect(resolveEmailProvider(undefined, "test")).toBe("noop")
    expect(resolveEmailProvider(undefined, "production")).toBe("cloudflare")
    expect(resolveEmailProvider(" console ", "production")).toBe("console")
  })

  it("local開発でのみMailpit URLを補う", () => {
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

describe("メール描画", () => {
  it("magic linkのHTMLとplain textを描画する", async () => {
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

  it("組織招待のHTMLとplain textを描画する", async () => {
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

  it("共通application shellでemail確認を描画する", async () => {
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

describe("メール送信", () => {
  const input = privateMailCommandFixture

  it("console送信器のloggerへ無害化済みmetadataだけを渡す", async () => {
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

  it("既定loggerを一度だけ呼び出す", async () => {
    const logger = vi.spyOn(console, "info").mockImplementation(() => {})
    try {
      await createConsoleSender()(input)

      expect(logger).toHaveBeenCalledOnce()
      expect(logger).toHaveBeenCalledWith("email:send", expect.any(Object))
    } finally {
      logger.mockRestore()
    }
  })

  it("本番でconsole providerを選ぶと安全側に失敗する", () => {
    expect(() =>
      createConfiguredEmailSender({
        provider: "console",
        runtime: "production",
      })
    ).toThrow(/disabled in production/)
  })

  it("明示的に無効化した本番配送経路でnoopを許可する", async () => {
    await expect(
      createConfiguredEmailSender({ provider: "noop", runtime: "production" })(
        input
      )
    ).resolves.toBeUndefined()
  })

  it("描画済みtransport fieldだけをlocal Mailpit inboxへ送る", async () => {
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

  it("省略可能なMailpit HTMLを除いてloopback URLを受け入れる", async () => {
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
  ])("localでないMailpit URLを拒否する: %s", (baseUrl) => {
    expect(() =>
      createMailpitEmailSender({
        baseUrl,
        from: "auth@example.com",
        runtime: "development",
      })
    ).toThrow(/MAILPIT_URL/)
  })

  it.each(["production", "test"] as const)(
    "%s runtimeでMailpitを拒否する",
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

  it("完全な開発設定がある場合だけMailpitを選ぶ", async () => {
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

  it("元のcauseを保持してMailpit network失敗を変換する", async () => {
    const providerError = new Error(
      "provider failed for user@example.com at https://example.com/token=abc"
    )
    const request = vi.fn<typeof fetch>().mockRejectedValue(providerError)
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
      cause: providerError,
    })
    await expect(delivery).rejects.not.toHaveProperty("to")
    await expect(delivery).rejects.not.toHaveProperty("body")
  })

  it("生responseを読まずMailpit HTTP失敗を変換する", async () => {
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

  it("request前に不正なMailpit宛先を拒否する", async () => {
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

  it("Cloudflareへ描画済みtransport fieldだけを送る", async () => {
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

  it("Cloudflare失敗を無害化済み再試行policyへ変換する", async () => {
    const providerError = {
      code: "E_RATE_LIMIT_EXCEEDED",
      message: "raw provider message containing user@example.com",
    }
    const send = vi.fn().mockRejectedValue(providerError)
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
        cause: providerError,
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

  it("観測に失敗しても受理済み配送を失敗へ変えない", async () => {
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

  it("binding呼出前に不正なaddressを拒否する", async () => {
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
