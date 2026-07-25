import { describe, expect, it, vi } from "vitest"

import { createGithubOAuthEmulatorProvider } from "./github-oauth-provider"

const environment = {
  mode: "emulator" as const,
  emulatorUrl: "http://github.emulate.localhost:4001",
  clientId: "local-client",
  clientSecret: "local-secret",
}

describe("GitHub OAuth emulator provider", () => {
  it("uses the emulator endpoints, scopes, POST authentication and PKCE", () => {
    const provider = createGithubOAuthEmulatorProvider(environment)

    expect(provider).toMatchObject({
      providerId: "github",
      clientId: "local-client",
      clientSecret: "local-secret",
      authorizationUrl:
        "http://github.emulate.localhost:4001/login/oauth/authorize",
      tokenUrl: "http://github.emulate.localhost:4001/login/oauth/access_token",
      scopes: ["read:user", "user:email"],
      authentication: "post",
      pkce: true,
    })
  })

  it("loads and maps the emulator profile through both GitHub endpoints", async () => {
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
      "http://github.emulate.localhost:4001/user",
      "http://github.emulate.localhost:4001/user/emails",
    ])
  })
})
