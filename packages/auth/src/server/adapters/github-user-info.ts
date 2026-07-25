import {
  mapGithubOAuthUserInfo,
  type GithubOAuthUserInfo,
} from "../../github-oauth"

type GithubOAuthUserInfoRequest = {
  accessToken: string
  userUrl: string
  emailsUrl: string
  fetcher?: typeof fetch
}

export const fetchGithubOAuthUserInfo = async ({
  accessToken,
  userUrl,
  emailsUrl,
  fetcher = fetch,
}: GithubOAuthUserInfoRequest): Promise<GithubOAuthUserInfo | null> => {
  if (!accessToken) {
    return null
  }

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": "enterprise-agentic-saas",
  }

  try {
    const [profileResponse, emailsResponse] = await Promise.all([
      fetcher(userUrl, { headers }),
      fetcher(emailsUrl, { headers }),
    ])
    if (!profileResponse.ok || !emailsResponse.ok) {
      return null
    }

    const [profile, emails] = await Promise.all([
      profileResponse.json(),
      emailsResponse.json(),
    ])
    return mapGithubOAuthUserInfo(profile, emails)
  } catch {
    return null
  }
}
