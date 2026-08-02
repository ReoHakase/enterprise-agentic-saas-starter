import * as v from "valibot"

import {
  LOCAL_GITHUB_OAUTH_CLIENT_ID,
  LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
} from "../github-oauth"

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
      url.pathname === "/emulate/github" &&
      url.search === "" &&
      url.hash === ""
    )
  }, "GitHub OAuth emulator URL must be a credential-free loopback /emulate/github base URL"),
  v.transform((input) => {
    const url = new URL(input)
    return `${url.origin}/emulate/github`
  })
)

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
      "GITHUB_OAUTH_EMULATOR_URL must be a credential-free loopback /emulate/github base URL"
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
