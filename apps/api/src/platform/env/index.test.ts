import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setEmailEnv = (mailpitUrl: string) => {
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("EMAIL_PROVIDER", "mailpit")
  vi.stubEnv("EMAIL_FROM", "noreply@example.com")
  vi.stubEnv("MAILPIT_URL", mailpitUrl)
}

describe("API email環境設定", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("設定可能なlocal Mailpit endpointを受理する", async () => {
    setEmailEnv(" https://mailpit.enterprise-agentic-saas.localhost ")

    const { env } = await import("./index")

    expect(env.EMAIL_PROVIDER).toBe("mailpit")
    expect(env.MAILPIT_URL).toBe(
      "https://mailpit.enterprise-agentic-saas.localhost"
    )
  })

  it("local環境fileの複製を要求せずMailpitを使う", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("EMAIL_PROVIDER", "")
    vi.stubEnv("EMAIL_FROM", "")
    vi.stubEnv("MAILPIT_URL", "")

    const { env } = await import("./index")

    expect(env.EMAIL_PROVIDER).toBe("mailpit")
    expect(env.EMAIL_FROM).toBe("noreply@example.test")
    expect(env.MAILPIT_URL).toBe(
      "https://mailpit.enterprise-agentic-saas.localhost"
    )
  })

  it.each([
    {
      expectedProvider: "noop",
      label: "test runtimeの場合",
      nodeEnv: "test",
    },
    {
      expectedProvider: "cloudflare",
      label: "production runtimeの場合",
      nodeEnv: "production",
    },
  ] as const)(
    "$labelで既定providerを使う",
    async ({ expectedProvider, nodeEnv }) => {
      vi.stubEnv("NODE_ENV", nodeEnv)
      vi.stubEnv("EMAIL_PROVIDER", "")
      vi.stubEnv("EMAIL_FROM", "noreply@example.com")
      vi.stubEnv("MAILPIT_URL", "")

      const { env } = await import("./index")

      expect(env.EMAIL_PROVIDER).toBe(expectedProvider)
      expect(env.MAILPIT_URL).toBeUndefined()
    }
  )

  it("runtime配線前に不正なMailpit endpointを拒否する", async () => {
    setEmailEnv("not-a-url")
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    try {
      await expect(import("./index")).rejects.toThrow(
        "Invalid environment variables"
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it.each([
    { expected: false, label: "空文字", value: "" },
    { expected: false, label: "0の場合", value: "0" },
    { expected: false, label: "trueの場合", value: "true" },
    { expected: false, label: "yesの場合", value: "yes" },
    { expected: true, label: "前後に空白がある1", value: " 1 " },
  ] as const)(
    "Agent asset upload flagが$labelの場合に正規化する",
    async ({ expected, value }) => {
      vi.stubEnv("AGENT_ASSET_UPLOAD_ENABLED", value)

      const { env } = await import("./index")

      expect(env.AGENT_ASSET_UPLOAD_ENABLED).toBe(expected)
    }
  )
})
