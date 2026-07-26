import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setEmailEnv = (mailpitUrl: string) => {
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("EMAIL_PROVIDER", "mailpit")
  vi.stubEnv("EMAIL_FROM", "noreply@example.com")
  vi.stubEnv("MAILPIT_URL", mailpitUrl)
}

describe("API email environment", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("accepts the configurable local Mailpit endpoint", async () => {
    setEmailEnv(" https://mailpit.enterprise-agentic-saas.localhost ")

    const { env } = await import("./index")

    expect(env.EMAIL_PROVIDER).toBe("mailpit")
    expect(env.MAILPIT_URL).toBe(
      "https://mailpit.enterprise-agentic-saas.localhost"
    )
  })

  it("uses Mailpit without requiring copied local environment files", async () => {
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
    ["test", "noop"],
    ["production", "cloudflare"],
  ] as const)(
    "uses the %s runtime default provider %s",
    async (nodeEnv, expectedProvider) => {
      vi.stubEnv("NODE_ENV", nodeEnv)
      vi.stubEnv("EMAIL_PROVIDER", "")
      vi.stubEnv("EMAIL_FROM", "noreply@example.com")
      vi.stubEnv("MAILPIT_URL", "")

      const { env } = await import("./index")

      expect(env.EMAIL_PROVIDER).toBe(expectedProvider)
      expect(env.MAILPIT_URL).toBeUndefined()
    }
  )

  it("rejects a malformed Mailpit endpoint before runtime wiring", async () => {
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
    ["", false],
    ["0", false],
    ["true", false],
    ["yes", false],
    [" 1 ", true],
  ] as const)(
    "resolves the Agent asset upload flag %s to %s",
    async (value, expected) => {
      vi.stubEnv("AGENT_ASSET_UPLOAD_ENABLED", value)

      const { env } = await import("./index")

      expect(env.AGENT_ASSET_UPLOAD_ENABLED).toBe(expected)
    }
  )
})
