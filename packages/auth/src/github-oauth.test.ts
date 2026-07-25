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

describe("GitHub OAuth emulator URL", () => {
  it.each([
    ["http://localhost:4001", "http://localhost:4001"],
    [
      " https://github.emulate.enterprise-agentic-saas.localhost/ ",
      "https://github.emulate.enterprise-agentic-saas.localhost",
    ],
    ["http://127.42.0.1:4001", "http://127.42.0.1:4001"],
    ["http://[::1]:4001", "http://[::1]:4001"],
  ])("normalizes the local root URL %s", (input, expected) => {
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
    "http://localhost:4001/user",
    "http://localhost:4001?token=secret",
    "http://localhost:4001#authorize",
  ])("rejects the non-local or non-root URL %s", (input) => {
    expect(() =>
      resolveGithubOAuthEnvironment({
        runtime: "development",
        emulatorUrl: input,
      })
    ).toThrow(
      "GITHUB_OAUTH_EMULATOR_URL must be a credential-free loopback root URL"
    )
  })

  it.each([
    "http://user:RAW_EMULATOR_SECRET@localhost:4001",
    "http://localhost:4001?token=RAW_EMULATOR_TOKEN",
  ])("does not retain rejected URL secrets in the thrown error", (input) => {
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

describe("GitHub OAuth environment boundary", () => {
  it("uses dedicated fake credentials and ignores real GitHub credentials", () => {
    expect(
      resolveGithubOAuthEnvironment({
        runtime: "development",
        emulatorUrl: "http://github.emulate.localhost:4001",
        githubClientId: "real-production-client-id",
        githubClientSecret: "real-production-client-secret",
      })
    ).toEqual({
      mode: "emulator",
      emulatorUrl: "http://github.emulate.localhost:4001",
      clientId: LOCAL_GITHUB_OAUTH_CLIENT_ID,
      clientSecret: LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
    })
  })

  it("allows a paired emulator-only credential override", () => {
    expect(
      resolveGithubOAuthEnvironment({
        runtime: "test",
        emulatorUrl: "http://localhost:4001",
        emulatorClientId: "e2e-client",
        emulatorClientSecret: "e2e-secret",
      })
    ).toMatchObject({
      mode: "emulator",
      clientId: "e2e-client",
      clientSecret: "e2e-secret",
    })
  })

  it("requires the real GitHub credential pair without the emulator", () => {
    expect(() =>
      resolveGithubOAuthEnvironment({ runtime: "development" })
    ).toThrow(
      "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required when the emulator is disabled"
    )
  })

  it("rejects a partial emulator credential override", () => {
    expect(() =>
      resolveGithubOAuthEnvironment({
        runtime: "test",
        emulatorUrl: "http://localhost:4001",
        emulatorClientId: "partial-client",
      })
    ).toThrow(
      "GITHUB_OAUTH_EMULATOR_CLIENT_ID and GITHUB_OAUTH_EMULATOR_CLIENT_SECRET must be set together"
    )
  })

  it("rejects the emulator in production even when its URL is local", () => {
    expect(() =>
      resolveGithubOAuthEnvironment({
        runtime: "production",
        emulatorUrl: "http://localhost:4001",
        githubClientId: "real-client",
        githubClientSecret: "real-secret",
      })
    ).toThrow("GITHUB_OAUTH_EMULATOR_URL must not be set in production")
  })
})

describe("GitHub OAuth user mapping", () => {
  it("prefers the primary verified email and maps avatar_url", () => {
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

  it("falls back to the login and rejects accounts without a verified email", () => {
    expect(
      mapGithubOAuthUserInfo({ ...profile, name: null }, [
        {
          email: "unverified@example.test",
          primary: true,
          verified: false,
        },
      ])
    ).toBeNull()

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

  it("fetches both GitHub endpoints without logging tokens or raw failures", async () => {
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
