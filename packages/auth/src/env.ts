import {
  resolveEmailFrom,
  resolveEmailProvider,
  resolveMailpitUrl,
} from "@enterprise-agentic-saas/email/config"
import { defineEnv } from "envin"
import * as v from "valibot"

import { resolveGithubOAuthEnvironment } from "./server/github-oauth-environment"

const commaSeparatedList = v.pipe(
  v.optional(v.string()),
  v.transform((input) =>
    input
      ? input
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  )
)

const emailFromSchema = v.pipe(
  v.optional(v.string()),
  v.transform((input) => resolveEmailFrom(input, process.env.NODE_ENV)),
  v.string(),
  v.email()
)

const emailProviderSchema = v.pipe(
  v.optional(v.string()),
  v.transform((input) => resolveEmailProvider(input, process.env.NODE_ENV)),
  v.picklist(["cloudflare", "console", "mailpit", "noop"])
)

const mailpitUrlSchema = v.pipe(
  v.optional(v.string()),
  v.transform((input) => resolveMailpitUrl(input, process.env.NODE_ENV)),
  v.optional(v.pipe(v.string(), v.url()))
)

const optionalTrimmedString = v.pipe(
  v.optional(v.string()),
  v.transform((input) => input?.trim() || undefined),
  v.optional(v.pipe(v.string(), v.minLength(1)))
)

const parsedEnv = defineEnv({
  shared: {
    NODE_ENV: v.pipe(
      v.optional(v.string(), "development"),
      v.picklist(["development", "test", "production"])
    ),
  },
  server: {
    APP_NAME: v.fallback(
      v.pipe(v.string(), v.minLength(1)),
      "Enterprise Agentic SaaS"
    ),
    BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(1)),
    BETTER_AUTH_URL: v.pipe(v.string(), v.url()),
    AUTH_COOKIE_DOMAIN: v.optional(v.pipe(v.string(), v.minLength(1))),
    GITHUB_CLIENT_ID: optionalTrimmedString,
    GITHUB_CLIENT_SECRET: optionalTrimmedString,
    GITHUB_OAUTH_EMULATOR_URL: optionalTrimmedString,
    GITHUB_OAUTH_EMULATOR_CLIENT_ID: optionalTrimmedString,
    GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: optionalTrimmedString,
    TRUSTED_ORIGINS: v.pipe(
      commaSeparatedList,
      v.array(v.pipe(v.string(), v.url())),
      v.minLength(1, "At least one trusted web origin is required")
    ),
    EMAIL_PROVIDER: emailProviderSchema,
    EMAIL_FROM: emailFromSchema,
    MAILPIT_URL: mailpitUrlSchema,
  },
  isServer: true,
  env: process.env,
})

if (
  parsedEnv.NODE_ENV === "production" &&
  new URL(parsedEnv.BETTER_AUTH_URL).protocol !== "https:"
) {
  throw new Error("BETTER_AUTH_URL must use HTTPS in production")
}

export const githubOAuthEnvironment = resolveGithubOAuthEnvironment({
  runtime: parsedEnv.NODE_ENV,
  emulatorUrl: parsedEnv.GITHUB_OAUTH_EMULATOR_URL,
  githubClientId: parsedEnv.GITHUB_CLIENT_ID,
  githubClientSecret: parsedEnv.GITHUB_CLIENT_SECRET,
  emulatorClientId: parsedEnv.GITHUB_OAUTH_EMULATOR_CLIENT_ID,
  emulatorClientSecret: parsedEnv.GITHUB_OAUTH_EMULATOR_CLIENT_SECRET,
})

export const env = parsedEnv
