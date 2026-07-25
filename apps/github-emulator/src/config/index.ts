import * as v from "valibot"

import { GITHUB_OAUTH_CALLBACK_PATH } from "../protocol/github-oauth"

const DEFAULT_PORT = 4001

const isLoopbackHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]"

const hasSafeLocalUrlParts = (input: string) => {
  const url = new URL(input)

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    isLoopbackHostname(url.hostname) &&
    url.username.length === 0 &&
    url.password.length === 0 &&
    url.search.length === 0 &&
    url.hash.length === 0
  )
}

const localOriginSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty(),
  v.url(),
  v.check(
    (input) => hasSafeLocalUrlParts(input) && new URL(input).pathname === "/",
    "localhostまたはloopbackのoriginを指定してください"
  ),
  v.transform((input) => new URL(input).origin)
)

const localCallbackSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty(),
  v.url(),
  v.check(
    (input) =>
      hasSafeLocalUrlParts(input) &&
      new URL(input).pathname === GITHUB_OAUTH_CALLBACK_PATH,
    `${GITHUB_OAUTH_CALLBACK_PATH} を持つlocalhost callbackを指定してください`
  ),
  v.transform((input) => new URL(input).toString())
)

const portSchema = v.pipe(
  v.optional(v.string(), String(DEFAULT_PORT)),
  v.trim(),
  v.regex(/^\d+$/, "1から65535までの整数を指定してください"),
  v.transform(Number),
  v.integer(),
  v.minValue(1),
  v.maxValue(65_535)
)

const disabledDebugFlagSchema = v.pipe(
  v.optional(v.string()),
  v.check(
    (input) =>
      input === undefined ||
      (input.trim().toLowerCase() !== "1" &&
        input.trim().toLowerCase() !== "true"),
    "OAuth codeやsecretを保護するためdebug flagは有効化できません"
  )
)

const environmentSchema = v.strictObject({
  NODE_ENV: v.optional(v.picklist(["development", "test"]), "development"),
  PORT: portSchema,
  DEBUG: disabledDebugFlagSchema,
  EMULATE_DEBUG: disabledDebugFlagSchema,
  GITHUB_OAUTH_EMULATOR_CLIENT_ID: v.pipe(v.string(), v.trim(), v.minLength(3)),
  GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(8)
  ),
  GITHUB_OAUTH_CALLBACK_URL: localCallbackSchema,
  GITHUB_OAUTH_EMULATOR_URL: v.optional(localOriginSchema),
  PORTLESS_URL: v.optional(localOriginSchema),
})

export type OAuthClientCredentials = {
  clientId: string
  clientSecret: string
}

export type GitHubEmulatorConfig = {
  port: number
  baseUrl: string
  callbackUrl: string
  clientId: string
  clientSecret: string
}

export class GitHubEmulatorEnvironmentError extends Error {
  constructor(details: readonly string[]) {
    super(
      ["GitHub OAuth emulatorの環境変数が不正です。", ...details].join("\n- ")
    )
    this.name = "GitHubEmulatorEnvironmentError"
  }
}

export const parseGitHubEmulatorConfig = (
  environment: Readonly<Record<string, string | undefined>>,
  defaultCredentials?: OAuthClientCredentials
): GitHubEmulatorConfig => {
  const result = v.safeParse(environmentSchema, {
    NODE_ENV: environment.NODE_ENV,
    PORT: environment.PORT,
    DEBUG: environment.DEBUG,
    EMULATE_DEBUG: environment.EMULATE_DEBUG,
    GITHUB_OAUTH_EMULATOR_CLIENT_ID:
      environment.GITHUB_OAUTH_EMULATOR_CLIENT_ID ??
      defaultCredentials?.clientId,
    GITHUB_OAUTH_EMULATOR_CLIENT_SECRET:
      environment.GITHUB_OAUTH_EMULATOR_CLIENT_SECRET ??
      defaultCredentials?.clientSecret,
    GITHUB_OAUTH_CALLBACK_URL: environment.GITHUB_OAUTH_CALLBACK_URL,
    GITHUB_OAUTH_EMULATOR_URL: environment.GITHUB_OAUTH_EMULATOR_URL,
    PORTLESS_URL: environment.PORTLESS_URL,
  })

  if (!result.success) {
    const details = result.issues.map((issue) => {
      const path =
        issue.path?.map((item) => String(item.key)).join(".") ?? "environment"

      return `${path}: ${issue.message}`
    })

    throw new GitHubEmulatorEnvironmentError(details)
  }

  return {
    port: result.output.PORT,
    baseUrl:
      result.output.GITHUB_OAUTH_EMULATOR_URL ??
      result.output.PORTLESS_URL ??
      `http://localhost:${result.output.PORT}`,
    callbackUrl: result.output.GITHUB_OAUTH_CALLBACK_URL,
    clientId: result.output.GITHUB_OAUTH_EMULATOR_CLIENT_ID,
    clientSecret: result.output.GITHUB_OAUTH_EMULATOR_CLIENT_SECRET,
  }
}
