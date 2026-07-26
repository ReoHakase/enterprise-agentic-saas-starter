import { describe, expect, it } from "vitest"

import {
  EmulateEnvironmentError,
  parseEmulateConfig,
  type OAuthClientCredentials,
} from "./index"

const DEFAULT_CREDENTIALS: OAuthClientCredentials = {
  clientId: "local-client-id",
  clientSecret: "local-client-secret",
}

const CALLBACK_URL =
  "https://api.enterprise-agentic-saas.localhost/auth/oauth2/callback/github"

describe("parseEmulateConfig", () => {
  it("GitHubの明示envを検証してoriginを正規化する", () => {
    expect(
      parseEmulateConfig("github", {
        PORT: "4101",
        GITHUB_OAUTH_EMULATOR_CLIENT_ID: "override-client",
        GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "override-secret",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
        EMULATE_BASE_URL:
          "https://github.emulate.enterprise-agentic-saas.localhost/",
      })
    ).toEqual({
      service: "github",
      port: 4101,
      baseUrl: "https://github.emulate.enterprise-agentic-saas.localhost",
      callbackUrl: CALLBACK_URL,
      clientId: "override-client",
      clientSecret: "override-secret",
    })
  })

  it("GitHubのcredential既定値とPortless URLを使える", () => {
    expect(
      parseEmulateConfig(
        "github",
        {
          GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
          PORTLESS_URL:
            "https://github.emulate.enterprise-agentic-saas.localhost",
        },
        DEFAULT_CREDENTIALS
      )
    ).toMatchObject({
      service: "github",
      port: 4001,
      baseUrl: "https://github.emulate.enterprise-agentic-saas.localhost",
      clientId: DEFAULT_CREDENTIALS.clientId,
      clientSecret: DEFAULT_CREDENTIALS.clientSecret,
    })
  })

  it.each([
    ["google", 4002],
    ["slack", 4003],
    ["apple", 4004],
    ["microsoft", 4005],
    ["okta", 4006],
    ["stripe", 4009],
  ] as const)(
    "%sはGitHub設定を要求せず既定portで起動できる",
    (service, port) => {
      expect(parseEmulateConfig(service, {})).toEqual({
        service,
        port,
        baseUrl: `http://localhost:${port}`,
      })
    }
  )

  it("明示portからloopback URLを組み立てる", () => {
    expect(parseEmulateConfig("stripe", { PORT: "4567" }).baseUrl).toBe(
      "http://localhost:4567"
    )
  })

  it("本番GitHub credentialをemulator設定として読まない", () => {
    expect(() =>
      parseEmulateConfig("github", {
        GITHUB_CLIENT_ID: "production-client-id",
        GITHUB_CLIENT_SECRET: "production-client-secret",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
      })
    ).toThrow(EmulateEnvironmentError)
  })

  it.each([
    [
      "production runtime",
      "google",
      {
        NODE_ENV: "production",
      },
    ],
    [
      "emulate debug",
      "slack",
      {
        EMULATE_DEBUG: "1",
      },
    ],
    [
      "generic debug",
      "apple",
      {
        DEBUG: "true",
      },
    ],
    [
      "remote emulator",
      "microsoft",
      {
        EMULATE_BASE_URL: "https://example.com",
      },
    ],
    [
      "remote callback",
      "github",
      {
        GITHUB_OAUTH_CALLBACK_URL:
          "https://example.com/auth/oauth2/callback/github",
      },
    ],
    [
      "wrong callback path",
      "github",
      {
        GITHUB_OAUTH_CALLBACK_URL: "http://localhost:3001/auth/callback/github",
      },
    ],
    [
      "invalid port",
      "stripe",
      {
        PORT: "65536",
      },
    ],
  ] as const)("%sを拒否する", (_label, service, environment) => {
    expect(() =>
      parseEmulateConfig(service, environment, DEFAULT_CREDENTIALS)
    ).toThrow(EmulateEnvironmentError)
  })

  it("対象外serviceを拒否する", () => {
    expect(() => parseEmulateConfig("aws", {})).toThrow(
      "未対応のemulate serviceです: aws"
    )
  })

  it("検証エラーへcredential値を含めない", () => {
    const secret = "must-not-appear-in-error"

    expect(() =>
      parseEmulateConfig("github", {
        GITHUB_OAUTH_EMULATOR_CLIENT_ID: "client-id",
        GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: secret,
        GITHUB_OAUTH_CALLBACK_URL: "not-a-url",
      })
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(secret),
      })
    )
  })
})
