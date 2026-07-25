import { describe, expect, it } from "vitest"

import {
  GitHubEmulatorEnvironmentError,
  parseGitHubEmulatorConfig,
  type OAuthClientCredentials,
} from "./index"

const DEFAULT_CREDENTIALS: OAuthClientCredentials = {
  clientId: "local-client-id",
  clientSecret: "local-client-secret",
}

const CALLBACK_URL =
  "https://api.enterprise-agentic-saas.localhost/auth/oauth2/callback/github"

describe("parseGitHubEmulatorConfig", () => {
  it("明示envを検証してoriginを正規化する", () => {
    expect(
      parseGitHubEmulatorConfig({
        PORT: "4101",
        GITHUB_OAUTH_EMULATOR_CLIENT_ID: "override-client",
        GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "override-secret",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
        GITHUB_OAUTH_EMULATOR_URL:
          "https://github.emulate.enterprise-agentic-saas.localhost/",
      })
    ).toEqual({
      port: 4101,
      baseUrl: "https://github.emulate.enterprise-agentic-saas.localhost",
      callbackUrl: CALLBACK_URL,
      clientId: "override-client",
      clientSecret: "override-secret",
    })
  })

  it("credential既定値とPortless URLを使える", () => {
    expect(
      parseGitHubEmulatorConfig(
        {
          GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
          PORTLESS_URL:
            "https://github.emulate.enterprise-agentic-saas.localhost",
        },
        DEFAULT_CREDENTIALS
      )
    ).toMatchObject({
      port: 4001,
      baseUrl: "https://github.emulate.enterprise-agentic-saas.localhost",
      clientId: DEFAULT_CREDENTIALS.clientId,
      clientSecret: DEFAULT_CREDENTIALS.clientSecret,
    })
  })

  it("Portlessなしではloopback URLを組み立てる", () => {
    expect(
      parseGitHubEmulatorConfig(
        {
          PORT: "4567",
          GITHUB_OAUTH_CALLBACK_URL:
            "http://127.0.0.1:3001/auth/oauth2/callback/github",
        },
        DEFAULT_CREDENTIALS
      ).baseUrl
    ).toBe("http://localhost:4567")
  })

  it("本番GitHub credentialはemulator設定として読まない", () => {
    expect(() =>
      parseGitHubEmulatorConfig({
        GITHUB_CLIENT_ID: "production-client-id",
        GITHUB_CLIENT_SECRET: "production-client-secret",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
      })
    ).toThrow(GitHubEmulatorEnvironmentError)
  })

  it.each([
    [
      "production runtime",
      {
        NODE_ENV: "production",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
      },
    ],
    [
      "emulate debug",
      {
        EMULATE_DEBUG: "1",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
      },
    ],
    [
      "generic debug",
      {
        DEBUG: "true",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
      },
    ],
    [
      "remote emulator",
      {
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
        GITHUB_OAUTH_EMULATOR_URL: "https://example.com",
      },
    ],
    [
      "remote callback",
      {
        GITHUB_OAUTH_CALLBACK_URL:
          "https://example.com/auth/oauth2/callback/github",
      },
    ],
    [
      "wrong callback path",
      {
        GITHUB_OAUTH_CALLBACK_URL: "http://localhost:3001/auth/callback/github",
      },
    ],
    [
      "invalid port",
      {
        PORT: "65536",
        GITHUB_OAUTH_CALLBACK_URL: CALLBACK_URL,
      },
    ],
  ])("%sを拒否する", (_label, environment) => {
    expect(() =>
      parseGitHubEmulatorConfig(environment, DEFAULT_CREDENTIALS)
    ).toThrow(GitHubEmulatorEnvironmentError)
  })

  it("validation errorへcredential値を含めない", () => {
    const secret = "must-not-appear-in-error"

    expect(() =>
      parseGitHubEmulatorConfig({
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
