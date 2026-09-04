import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setRequiredAuthEnvironment } from "../test-support/environment"

const setRequiredEnv = (mailpitUrl: string) =>
  setRequiredAuthEnvironment({ mailpitUrl })

describe("認証メールの環境設定", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("APIと同じ変更可能なMailpit URLを受理する", async () => {
    setRequiredEnv(" https://mailpit.enterprise-agentic-saas.localhost ")

    const { env } = await import("./env")

    expect(env.EMAIL_PROVIDER).toBe("mailpit")
    expect(env.MAILPIT_URL).toBe(
      "https://mailpit.enterprise-agentic-saas.localhost"
    )
  })

  it("ローカル環境ファイルを複製せずMailpitの既定値を使う", async () => {
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
    "%sランタイムでは%sプロバイダーを既定にする",
    async (nodeEnv, expectedProvider) => {
      setRequiredEnv("")
      vi.stubEnv("NODE_ENV", nodeEnv)
      vi.stubEnv("EMAIL_PROVIDER", "")

      const { env } = await import("./env")

      expect(env.EMAIL_PROVIDER).toBe(expectedProvider)
      expect(env.MAILPIT_URL).toBeUndefined()
    }
  )

  it("認証初期化前に不正なMailpit URLを拒否する", async () => {
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

  it("実GitHub認証情報を読まずエミュレーター専用の既定値を使う", async () => {
    setRequiredEnv("")
    vi.stubEnv(
      "GITHUB_OAUTH_EMULATOR_URL",
      " http://github.emulate.enterprise-agentic-saas.localhost:4001/emulate/github "
    )
    vi.stubEnv("GITHUB_CLIENT_ID", "real-production-client")
    vi.stubEnv("GITHUB_CLIENT_SECRET", "real-production-secret")

    const { githubOAuthEnvironment } = await import("./env")

    expect(githubOAuthEnvironment).toEqual({
      mode: "emulator",
      emulatorUrl:
        "http://github.emulate.enterprise-agentic-saas.localhost:4001/emulate/github",
      clientId: "enterprise-agentic-saas-local",
      clientSecret: "enterprise-agentic-saas-local-secret",
    })
  })

  it.each([
    "https://github.com",
    "http://localhost:4001",
    "http://localhost:4001/emulate/github/",
    "http://localhost:4001/emulate/gitlab",
    "http://user:secret@localhost:4001",
    "http://localhost:4001?token=secret",
  ])("安全でないエミュレーターURLを拒否する %s", async (emulatorUrl) => {
    setRequiredEnv("")
    vi.stubEnv("GITHUB_OAUTH_EMULATOR_URL", emulatorUrl)

    await expect(import("./env")).rejects.toThrow(
      "GITHUB_OAUTH_EMULATOR_URL must be a credential-free loopback /emulate/github base URL"
    )
  })

  it("本番でエミュレーターが設定された場合は起動を拒否する", async () => {
    setRequiredEnv("")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv(
      "GITHUB_OAUTH_EMULATOR_URL",
      "http://localhost:4001/emulate/github"
    )

    await expect(import("./env")).rejects.toThrow(
      "GITHUB_OAUTH_EMULATOR_URL must not be set in production"
    )
  })

  it("本番のBetter Auth originにHTTPSを要求する", async () => {
    setRequiredEnv("")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BETTER_AUTH_URL", "http://api.example.test")

    await expect(import("./env")).rejects.toThrow(
      "BETTER_AUTH_URL must use HTTPS in production"
    )
  })
})
