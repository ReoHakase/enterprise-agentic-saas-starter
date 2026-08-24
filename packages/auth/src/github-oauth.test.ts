import { describe, expect, it, vi } from "vitest"

import {
  LOCAL_GITHUB_OAUTH_CLIENT_ID,
  LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
  mapGithubOAuthUserInfo,
} from "./github-oauth"
import { fetchGithubOAuthUserInfo } from "./server/adapters/github-user-info"
import { resolveGithubOAuthEnvironment } from "./server/github-oauth-environment"

const profile = {
  id: 123,
  login: "octocat",
  name: "The Octocat",
  email: "profile@example.test",
  avatar_url: "https://avatars.example.test/octocat.png",
}

describe("GitHub OAuthエミュレーターURL", () => {
  it.each([
    [
      "http://localhost:4001/emulate/github",
      "http://localhost:4001/emulate/github",
    ],
    [
      " https://github.emulate.enterprise-agentic-saas.localhost/emulate/github ",
      "https://github.emulate.enterprise-agentic-saas.localhost/emulate/github",
    ],
    [
      "http://127.42.0.1:4001/emulate/github",
      "http://127.42.0.1:4001/emulate/github",
    ],
    ["http://[::1]:4001/emulate/github", "http://[::1]:4001/emulate/github"],
  ])("ローカルエミュレーターの基準URLを正規化する %s", (input, expected) => {
    expect(
      resolveGithubOAuthEnvironment({
        runtime: "development",
        emulatorUrl: input,
      })
    ).toMatchObject({ emulatorUrl: expected })
  })

  it.each([
    "https://github.com",
    "http://192.168.1.2:4001",
    "ftp://localhost:4001",
    "http://user:secret@localhost:4001",
    "http://localhost:4001",
    "http://localhost:4001/user",
    "http://localhost:4001/emulate/github/",
    "http://localhost:4001/emulate/github?token=secret",
    "http://localhost:4001/emulate/github#authorize",
  ])("ローカルでないURLまたは正規形でないURLを拒否する %s", (input) => {
    expect(() =>
      resolveGithubOAuthEnvironment({
        runtime: "development",
        emulatorUrl: input,
      })
    ).toThrow(
      "GITHUB_OAUTH_EMULATOR_URL must be a credential-free loopback /emulate/github base URL"
    )
  })

  it.each([
    "http://user:RAW_EMULATOR_SECRET@localhost:4001/emulate/github",
    "http://localhost:4001/emulate/github?token=RAW_EMULATOR_TOKEN",
  ])("拒否したURLの機密情報を例外へ残さない %s", (input) => {
    let thrown: unknown
    try {
      resolveGithubOAuthEnvironment({
        runtime: "development",
        emulatorUrl: input,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    if (!(thrown instanceof Error)) {
      throw new Error("Expected an Error")
    }
    expect(JSON.stringify(thrown)).not.toContain("RAW_EMULATOR")
    expect(String(thrown)).not.toContain("RAW_EMULATOR")
    expect(thrown.cause).toBeUndefined()
  })
})

describe("GitHub OAuthの環境境界", () => {
  it("専用のfake認証情報を使い実GitHub認証情報を無視する", () => {
    expect(
      resolveGithubOAuthEnvironment({
        runtime: "development",
        emulatorUrl: "http://github.emulate.localhost:4001/emulate/github",
        githubClientId: "real-production-client-id",
        githubClientSecret: "real-production-client-secret",
      })
    ).toEqual({
      mode: "emulator",
      emulatorUrl: "http://github.emulate.localhost:4001/emulate/github",
      clientId: LOCAL_GITHUB_OAUTH_CLIENT_ID,
      clientSecret: LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
    })
  })

  it("エミュレーター専用認証情報の組を上書きできる", () => {
    expect(
      resolveGithubOAuthEnvironment({
        runtime: "test",
        emulatorUrl: "http://localhost:4001/emulate/github",
        emulatorClientId: "e2e-client",
        emulatorClientSecret: "e2e-secret",
      })
    ).toMatchObject({
      mode: "emulator",
      clientId: "e2e-client",
      clientSecret: "e2e-secret",
    })
  })

  it("エミュレーターを使わない場合は実GitHub認証情報の組を要求する", () => {
    expect(() =>
      resolveGithubOAuthEnvironment({ runtime: "development" })
    ).toThrow(
      "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required when the emulator is disabled"
    )
  })

  it("片方だけのエミュレーター認証情報を拒否する", () => {
    expect(() =>
      resolveGithubOAuthEnvironment({
        runtime: "test",
        emulatorUrl: "http://localhost:4001/emulate/github",
        emulatorClientId: "partial-client",
      })
    ).toThrow(
      "GITHUB_OAUTH_EMULATOR_CLIENT_ID and GITHUB_OAUTH_EMULATOR_CLIENT_SECRET must be set together"
    )
  })

  it("URLがローカルでも本番ではエミュレーターを拒否する", () => {
    expect(() =>
      resolveGithubOAuthEnvironment({
        runtime: "production",
        emulatorUrl: "http://localhost:4001/emulate/github",
        githubClientId: "real-client",
        githubClientSecret: "real-secret",
      })
    ).toThrow("GITHUB_OAUTH_EMULATOR_URL must not be set in production")
  })
})

describe("GitHub OAuth利用者情報の変換", () => {
  it("検証済みの主メールを優先して画像URLを変換する", () => {
    expect(
      mapGithubOAuthUserInfo(profile, [
        {
          email: "profile@example.test",
          primary: false,
          verified: true,
        },
        {
          email: "PRIMARY@EXAMPLE.TEST",
          primary: true,
          verified: true,
        },
      ])
    ).toEqual({
      id: "123",
      name: "The Octocat",
      email: "primary@example.test",
      emailVerified: true,
      image: "https://avatars.example.test/octocat.png",
    })
  })

  it("検証済みメールがない利用者を拒否する", () => {
    expect(
      mapGithubOAuthUserInfo({ ...profile, name: null }, [
        {
          email: "unverified@example.test",
          primary: true,
          verified: false,
        },
      ])
    ).toBeNull()
  })

  it("表示名がない利用者にはログイン名を使う", () => {
    expect(
      mapGithubOAuthUserInfo({ ...profile, name: null }, [
        {
          email: "verified@example.test",
          primary: false,
          verified: true,
        },
      ])
    ).toMatchObject({ name: "octocat" })
  })

  it("プロフィールとメールを取得してアクセストークンを認証ヘッダーに限定する", async () => {
    const accessToken = "LOCAL_OAUTH_ACCESS_TOKEN_NOT_FOR_LOGS"
    const responses = [
      new Response(JSON.stringify(profile), {
        headers: { "content-type": "application/json" },
      }),
      new Response(
        JSON.stringify([
          {
            email: "verified@example.test",
            primary: true,
            verified: true,
          },
        ]),
        { headers: { "content-type": "application/json" } }
      ),
    ]
    const fetcher = vi.fn<typeof fetch>(
      async () => responses.shift() ?? new Response(null, { status: 500 })
    )

    await expect(
      fetchGithubOAuthUserInfo({
        accessToken,
        userUrl: "http://localhost:4001/user",
        emailsUrl: "http://localhost:4001/user/emails",
        fetcher,
      })
    ).resolves.toMatchObject({ email: "verified@example.test" })

    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${accessToken}`
      )
    }
  })

  it("GitHub取得失敗を公開せずログにも記録しない", async () => {
    const accessToken = "LOCAL_OAUTH_ACCESS_TOKEN_NOT_FOR_LOGS"
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await expect(
        fetchGithubOAuthUserInfo({
          accessToken,
          userUrl: "http://localhost:4001/user",
          emailsUrl: "http://localhost:4001/user/emails",
          fetcher: vi.fn<typeof fetch>(async () => {
            throw new Error("raw")
          }),
        })
      ).resolves.toBeNull()
      expect(errorSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})
