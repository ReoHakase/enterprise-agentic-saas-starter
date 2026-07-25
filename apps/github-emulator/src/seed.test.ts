import { describe, expect, it } from "vitest"

import type { GitHubEmulatorConfig } from "./config"
import { createGitHubOAuthSeed } from "./seed"

const CONFIG: GitHubEmulatorConfig = {
  port: 4001,
  baseUrl: "http://localhost:4001",
  callbackUrl: "http://localhost:3001/auth/oauth2/callback/github",
  clientId: "local-client-id",
  clientSecret: "local-client-secret",
}

describe("createGitHubOAuthSeed", () => {
  it("deterministic userとstrict OAuth appを毎回seedする", () => {
    expect(createGitHubOAuthSeed(CONFIG)).toEqual({
      github: {
        users: [
          {
            login: "oauth-alice",
            name: "OAuth Alice",
            email: "oauth-alice@example.test",
            bio: "Deterministic local OAuth test account",
            site_admin: false,
          },
        ],
        oauth_apps: [
          {
            client_id: CONFIG.clientId,
            client_secret: CONFIG.clientSecret,
            name: "Enterprise Agentic SaaS (Local)",
            redirect_uris: [CONFIG.callbackUrl],
          },
        ],
      },
    })
  })

  it("呼び出し間でmutable seedを共有しない", () => {
    const first = createGitHubOAuthSeed(CONFIG)
    const second = createGitHubOAuthSeed(CONFIG)

    expect(first.github.users).not.toBe(second.github.users)
    expect(first.github.oauth_apps).not.toBe(second.github.oauth_apps)
  })
})
