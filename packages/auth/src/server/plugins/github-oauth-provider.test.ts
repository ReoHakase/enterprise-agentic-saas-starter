import { describe, expect, it, vi } from "vitest"

import { createGithubOAuthEmulatorProvider } from "./github-oauth-provider"

const environment = {
  mode: "emulator" as const,
  emulatorUrl: "http://github.emulate.localhost:4001/emulate/github",
  clientId: "local-client",
  clientSecret: "local-secret",
}

describe("GitHub OAuthエミュレータープロバイダー", () => {
  it("プロフィールとメールを取得してエミュレーター利用者を変換する", async () => {
    const responses = [
      Response.json({
        id: 42,
        login: "local-octocat",
        name: null,
        email: null,
        avatar_url: "https://avatars.example.test/local.png",
      }),
      Response.json([
        {
          email: "local@example.test",
          primary: true,
          verified: true,
        },
      ]),
    ]
    const fetcher = vi.fn<typeof fetch>(
      async () => responses.shift() ?? new Response(null, { status: 500 })
    )
    const provider = createGithubOAuthEmulatorProvider(environment, fetcher)

    await expect(
      provider.getUserInfo?.({ accessToken: "local-access-token" })
    ).resolves.toEqual({
      id: "42",
      name: "local-octocat",
      email: "local@example.test",
      emailVerified: true,
      image: "https://avatars.example.test/local.png",
    })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "http://github.emulate.localhost:4001/emulate/github/user",
      "http://github.emulate.localhost:4001/emulate/github/user/emails",
    ])
  })
})
