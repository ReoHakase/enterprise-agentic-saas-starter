import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const setRequiredEnv = (mailpitUrl: string) => {
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long")
  vi.stubEnv("BETTER_AUTH_URL", "https://api.example.test")
  vi.stubEnv("GITHUB_CLIENT_ID", "test-github-client")
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-github-secret")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_URL", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_ID", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_SECRET", "")
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

  it("uses emulator-only defaults without reading real GitHub credentials", async () => {
    setRequiredEnv("")
    vi.stubEnv(
      "GITHUB_OAUTH_EMULATOR_URL",
      " http://github.emulate.enterprise-agentic-saas.localhost:4001/ "
    )
    vi.stubEnv("GITHUB_CLIENT_ID", "real-production-client")
    vi.stubEnv("GITHUB_CLIENT_SECRET", "real-production-secret")

    const { githubOAuthEnvironment } = await import("./env")

    expect(githubOAuthEnvironment).toEqual({
      mode: "emulator",
      emulatorUrl:
        "http://github.emulate.enterprise-agentic-saas.localhost:4001",
      clientId: "enterprise-agentic-saas-local",
      clientSecret: "enterprise-agentic-saas-local-secret",
    })
  })

  it.each([
    "https://github.com",
    "http://localhost:4001/user",
    "http://user:secret@localhost:4001",
    "http://localhost:4001?token=secret",
  ])("rejects the unsafe emulator URL %s", async (emulatorUrl) => {
    setRequiredEnv("")
    vi.stubEnv("GITHUB_OAUTH_EMULATOR_URL", emulatorUrl)

    await expect(import("./env")).rejects.toThrow(
      "GITHUB_OAUTH_EMULATOR_URL must be a credential-free loopback root URL"
    )
  })

  it("fails closed when the emulator is configured in production", async () => {
    setRequiredEnv("")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GITHUB_OAUTH_EMULATOR_URL", "http://localhost:4001")

    await expect(import("./env")).rejects.toThrow(
      "GITHUB_OAUTH_EMULATOR_URL must not be set in production"
    )
  })

  it("requires HTTPS for the production Better Auth origin", async () => {
    setRequiredEnv("")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BETTER_AUTH_URL", "http://api.example.test")

    await expect(import("./env")).rejects.toThrow(
      "BETTER_AUTH_URL must use HTTPS in production"
    )
  })
})
