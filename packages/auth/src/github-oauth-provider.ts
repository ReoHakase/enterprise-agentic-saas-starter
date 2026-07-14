import type { GenericOAuthConfig } from "better-auth/plugins"

import {
  fetchGithubOAuthUserInfo,
  type GithubOAuthEnvironment,
} from "./github-oauth"

type GithubOAuthEmulatorEnvironment = Extract<
  GithubOAuthEnvironment,
  { mode: "emulator" }
>

export const createGithubOAuthEmulatorProvider = (
  environment: GithubOAuthEmulatorEnvironment,
  fetcher: typeof fetch = fetch
): GenericOAuthConfig => ({
  providerId: "github",
  clientId: environment.clientId,
  clientSecret: environment.clientSecret,
  authorizationUrl: `${environment.emulatorUrl}/login/oauth/authorize`,
  tokenUrl: `${environment.emulatorUrl}/login/oauth/access_token`,
  scopes: ["read:user", "user:email"],
  authentication: "post",
  pkce: true,
  authorizationHeaders: {
    accept: "application/json",
    "user-agent": "enterprise-agentic-saas",
  },
  async getUserInfo(tokens) {
    if (!tokens.accessToken) {
      return null
    }

    return fetchGithubOAuthUserInfo({
      accessToken: tokens.accessToken,
      userUrl: `${environment.emulatorUrl}/user`,
      emailsUrl: `${environment.emulatorUrl}/user/emails`,
      fetcher,
    })
  },
})
