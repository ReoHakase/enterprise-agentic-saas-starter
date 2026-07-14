import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setRequiredEnv = (mailpitUrl: string) => {
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long")
  vi.stubEnv("BETTER_AUTH_URL", "https://api.example.test")
  vi.stubEnv("GITHUB_CLIENT_ID", "test-github-client")
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-github-secret")
  vi.stubEnv("TRUSTED_ORIGINS", "https://app.example.test")
  vi.stubEnv("EMAIL_PROVIDER", "mailpit")
  vi.stubEnv("EMAIL_FROM", "noreply@example.com")
  vi.stubEnv("MAILPIT_URL", mailpitUrl)
}

describe("authentication email environment", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("accepts the same configurable Mailpit endpoint as the API", async () => {
    setRequiredEnv(" https://mailpit.enterprise-agentic-saas.localhost ")

    const { env } = await import("./env")

    expect(env.EMAIL_PROVIDER).toBe("mailpit")
    expect(env.MAILPIT_URL).toBe(
      "https://mailpit.enterprise-agentic-saas.localhost"
    )
  })

  it("uses Mailpit without requiring copied local environment files", async () => {
    setRequiredEnv("")
    vi.stubEnv("EMAIL_PROVIDER", "")
    vi.stubEnv("EMAIL_FROM", "")

    const { env } = await import("./env")

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
      setRequiredEnv("")
      vi.stubEnv("NODE_ENV", nodeEnv)
      vi.stubEnv("EMAIL_PROVIDER", "")

      const { env } = await import("./env")

      expect(env.EMAIL_PROVIDER).toBe(expectedProvider)
      expect(env.MAILPIT_URL).toBeUndefined()
    }
  )

  it("rejects a malformed Mailpit endpoint before auth initialization", async () => {
    setRequiredEnv("not-a-url")
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    try {
      await expect(import("./env")).rejects.toThrow(
        "Invalid environment variables"
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
