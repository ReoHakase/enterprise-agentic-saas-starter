import type { SeedConfig } from "emulate"

import type { GitHubEmulatorConfig } from "../config/index"

const LOCAL_GITHUB_USER = {
  login: "oauth-alice",
  name: "OAuth Alice",
  email: "oauth-alice@example.test",
  bio: "Deterministic local OAuth test account",
  site_admin: false,
}

type GitHubOAuthSeed = SeedConfig & {
  github: {
    users: Array<typeof LOCAL_GITHUB_USER>
    oauth_apps: Array<{
      client_id: string
      client_secret: string
      name: string
      redirect_uris: string[]
    }>
  }
}

export const createGitHubOAuthSeed = (
  config: GitHubEmulatorConfig
): GitHubOAuthSeed => ({
  github: {
    users: [{ ...LOCAL_GITHUB_USER }],
    oauth_apps: [
      {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        name: "Enterprise Agentic SaaS (Local)",
        redirect_uris: [config.callbackUrl],
      },
    ],
  },
})
