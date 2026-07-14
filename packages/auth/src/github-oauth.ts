import * as v from "valibot"

export const LOCAL_GITHUB_OAUTH_CLIENT_ID = "enterprise-agentic-saas-local"
export const LOCAL_GITHUB_OAUTH_CLIENT_SECRET =
  "enterprise-agentic-saas-local-secret"

const nonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1))

const isLoopbackHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  hostname === "[::1]" ||
  /^127(?:\.[0-9]{1,3}){3}$/.test(hostname)

const githubOAuthEmulatorUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.url(),
  v.check((input) => {
    const url = new URL(input)

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      isLoopbackHostname(url.hostname) &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    )
  }, "GitHub OAuth emulator URL must be a credential-free loopback root URL"),
  v.transform((input) => new URL(input).origin)
)

const githubProfileSchema = v.object({
  id: v.union([v.pipe(v.number(), v.integer()), nonEmptyStringSchema]),
  login: nonEmptyStringSchema,
  name: v.nullish(v.pipe(v.string(), v.trim())),
  email: v.nullish(v.pipe(v.string(), v.trim(), v.email())),
  avatar_url: v.nullish(v.pipe(v.string(), v.url())),
})

const githubEmailSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.email()),
  primary: v.boolean(),
  verified: v.boolean(),
})

const githubEmailsSchema = v.array(githubEmailSchema)

const optionalCredentialSchema = v.pipe(
  v.optional(v.string()),
  v.transform((input) => input?.trim() || undefined),
  v.optional(nonEmptyStringSchema)
)

export type GithubOAuthEnvironment =
  | {
      mode: "github"
      clientId: string
      clientSecret: string
    }
  | {
      mode: "emulator"
      emulatorUrl: string
      clientId: string
      clientSecret: string
    }

type GithubOAuthEnvironmentInput = {
  runtime: "development" | "test" | "production"
  emulatorUrl?: string
  githubClientId?: string
  githubClientSecret?: string
  emulatorClientId?: string
  emulatorClientSecret?: string
}

const parseOptionalCredential = (name: string, input: string | undefined) => {
  const result = v.safeParse(optionalCredentialSchema, input)
  if (!result.success) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return result.output
}

export const resolveGithubOAuthEnvironment = ({
  runtime,
  emulatorUrl,
  githubClientId,
  githubClientSecret,
  emulatorClientId,
  emulatorClientSecret,
}: GithubOAuthEnvironmentInput): GithubOAuthEnvironment => {
  const emulatorUrlResult = emulatorUrl
    ? v.safeParse(githubOAuthEmulatorUrlSchema, emulatorUrl)
    : undefined
  if (emulatorUrlResult && !emulatorUrlResult.success) {
    throw new Error(
      "GITHUB_OAUTH_EMULATOR_URL must be a credential-free loopback root URL"
    )
  }
  const parsedEmulatorUrl = emulatorUrlResult?.output

  if (runtime === "production" && parsedEmulatorUrl) {
    throw new Error("GITHUB_OAUTH_EMULATOR_URL must not be set in production")
  }

  const parsedEmulatorClientId = parseOptionalCredential(
    "GITHUB_OAUTH_EMULATOR_CLIENT_ID",
    emulatorClientId
  )
  const parsedEmulatorClientSecret = parseOptionalCredential(
    "GITHUB_OAUTH_EMULATOR_CLIENT_SECRET",
    emulatorClientSecret
  )
  const hasEmulatorClientId = parsedEmulatorClientId !== undefined
  const hasEmulatorClientSecret = parsedEmulatorClientSecret !== undefined

  if (hasEmulatorClientId !== hasEmulatorClientSecret) {
    throw new Error(
      "GITHUB_OAUTH_EMULATOR_CLIENT_ID and GITHUB_OAUTH_EMULATOR_CLIENT_SECRET must be set together"
    )
  }
  if (!parsedEmulatorUrl && hasEmulatorClientId) {
    throw new Error(
      "GitHub OAuth emulator credentials require GITHUB_OAUTH_EMULATOR_URL"
    )
  }

  if (parsedEmulatorUrl) {
    return {
      mode: "emulator",
      emulatorUrl: parsedEmulatorUrl,
      clientId: parsedEmulatorClientId ?? LOCAL_GITHUB_OAUTH_CLIENT_ID,
      clientSecret:
        parsedEmulatorClientSecret ?? LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
    }
  }

  const parsedGithubClientId = parseOptionalCredential(
    "GITHUB_CLIENT_ID",
    githubClientId
  )
  const parsedGithubClientSecret = parseOptionalCredential(
    "GITHUB_CLIENT_SECRET",
    githubClientSecret
  )
  if (!parsedGithubClientId || !parsedGithubClientSecret) {
    throw new Error(
      "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required when the emulator is disabled"
    )
  }

  return {
    mode: "github",
    clientId: parsedGithubClientId,
    clientSecret: parsedGithubClientSecret,
  }
}

export type GithubOAuthUserInfo = {
  id: string
  name: string
  email: string
  emailVerified: true
  image?: string
}

export const mapGithubOAuthUserInfo = (
  profileInput: unknown,
  emailsInput: unknown
): GithubOAuthUserInfo | null => {
  const profileResult = v.safeParse(githubProfileSchema, profileInput)
  const emailsResult = v.safeParse(githubEmailsSchema, emailsInput)
  if (!profileResult.success || !emailsResult.success) {
    return null
  }

  const profile = profileResult.output
  const emails = emailsResult.output
  const primaryVerifiedEmail = emails.find(
    (entry) => entry.primary && entry.verified
  )
  const profileVerifiedEmail = profile.email
    ? emails.find(
        (entry) =>
          entry.verified &&
          entry.email.toLowerCase() === profile.email?.toLowerCase()
      )
    : undefined
  const verifiedEmail =
    primaryVerifiedEmail ??
    profileVerifiedEmail ??
    emails.find((entry) => entry.verified)

  if (!verifiedEmail) {
    return null
  }

  return {
    id: String(profile.id),
    name: profile.name || profile.login,
    email: verifiedEmail.email.toLowerCase(),
    emailVerified: true,
    ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
  }
}

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
