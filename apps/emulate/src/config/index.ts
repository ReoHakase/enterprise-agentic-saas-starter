import * as v from "valibot"

import { GITHUB_OAUTH_CALLBACK_PATH } from "../protocol/github-oauth"
import {
  getEmulateServiceDefinition,
  parseEmulateService,
  type EmulateService,
} from "../services/registry"

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

const createPortSchema = (defaultPort: number) =>
  v.pipe(
    v.optional(v.string(), String(defaultPort)),
    v.trim(),
    v.regex(/^\d+$/u, "1から65535までの整数を指定してください"),
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
    "認証コードやシークレットを保護するためdebug flagは有効化できません"
  )
)

const createCommonEnvironmentSchema = (defaultPort: number) =>
  v.strictObject({
    NODE_ENV: v.optional(v.picklist(["development", "test"]), "development"),
    PORT: createPortSchema(defaultPort),
    DEBUG: disabledDebugFlagSchema,
    EMULATE_DEBUG: disabledDebugFlagSchema,
    EMULATE_BASE_URL: v.optional(localOriginSchema),
    PORTLESS_URL: v.optional(localOriginSchema),
  })

const githubEnvironmentSchema = v.strictObject({
  GITHUB_OAUTH_EMULATOR_CLIENT_ID: v.pipe(v.string(), v.trim(), v.minLength(3)),
  GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(8)
  ),
  GITHUB_OAUTH_CALLBACK_URL: localCallbackSchema,
})

export type OAuthClientCredentials = {
  clientId: string
  clientSecret: string
}

type BaseEmulateConfig = {
  service: EmulateService
  port: number
  baseUrl: string
}

export type GitHubEmulatorConfig = BaseEmulateConfig & {
  service: "github"
  callbackUrl: string
  clientId: string
  clientSecret: string
}

export type EmulateConfig =
  | GitHubEmulatorConfig
  | (BaseEmulateConfig & {
      service: Exclude<EmulateService, "github">
    })

export class EmulateEnvironmentError extends Error {
  constructor(details: readonly string[]) {
    super(["emulatorの環境変数が不正です。", ...details].join("\n- "))
    this.name = "EmulateEnvironmentError"
  }
}

const formatIssues = (
  issues: readonly {
    message: string
    path?: readonly { key: unknown }[]
  }[]
) =>
  issues.map((issue) => {
    const path =
      issue.path?.map((item) => String(item.key)).join(".") ?? "environment"

    return `${path}: ${issue.message}`
  })

const parseCommonEnvironment = (
  service: EmulateService,
  environment: Readonly<Record<string, string | undefined>>
) => {
  const definition = getEmulateServiceDefinition(service)
  const result = v.safeParse(
    createCommonEnvironmentSchema(definition.defaultPort),
    {
      NODE_ENV: environment.NODE_ENV,
      PORT: environment.PORT,
      DEBUG: environment.DEBUG,
      EMULATE_DEBUG: environment.EMULATE_DEBUG,
      EMULATE_BASE_URL: environment.EMULATE_BASE_URL,
      PORTLESS_URL: environment.PORTLESS_URL,
    }
  )

  if (!result.success) {
    throw new EmulateEnvironmentError(formatIssues(result.issues))
  }

  return {
    service,
    port: result.output.PORT,
    baseUrl:
      result.output.EMULATE_BASE_URL ??
      result.output.PORTLESS_URL ??
      `http://localhost:${result.output.PORT}`,
  }
}

export const parseEmulateConfig = (
  serviceInput: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  defaultCredentials?: OAuthClientCredentials
): EmulateConfig => {
  const service = parseEmulateService(serviceInput)
  const common = parseCommonEnvironment(service, environment)

  if (service !== "github") {
    return { ...common, service }
  }

  const github = v.safeParse(githubEnvironmentSchema, {
    GITHUB_OAUTH_EMULATOR_CLIENT_ID:
      environment.GITHUB_OAUTH_EMULATOR_CLIENT_ID ??
      defaultCredentials?.clientId,
    GITHUB_OAUTH_EMULATOR_CLIENT_SECRET:
      environment.GITHUB_OAUTH_EMULATOR_CLIENT_SECRET ??
      defaultCredentials?.clientSecret,
    GITHUB_OAUTH_CALLBACK_URL: environment.GITHUB_OAUTH_CALLBACK_URL,
  })

  if (!github.success) {
    throw new EmulateEnvironmentError(formatIssues(github.issues))
  }

  return {
    ...common,
    service,
    callbackUrl: github.output.GITHUB_OAUTH_CALLBACK_URL,
    clientId: github.output.GITHUB_OAUTH_EMULATOR_CLIENT_ID,
    clientSecret: github.output.GITHUB_OAUTH_EMULATOR_CLIENT_SECRET,
  }
}
