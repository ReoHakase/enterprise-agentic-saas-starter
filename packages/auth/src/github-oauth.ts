import * as v from "valibot"

export const LOCAL_GITHUB_OAUTH_CLIENT_ID = "enterprise-agentic-saas-local"
export const LOCAL_GITHUB_OAUTH_CLIENT_SECRET =
  "enterprise-agentic-saas-local-secret"

const nonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1))

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
