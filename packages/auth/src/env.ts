import {
  resolveEmailFrom,
  resolveEmailProvider,
  resolveMailpitUrl,
} from "@enterprise-agentic-saas/email/config"
import { defineEnv } from "envin"
import * as v from "valibot"

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

export const env = defineEnv({
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
    GITHUB_CLIENT_ID: v.pipe(v.string(), v.minLength(1)),
    GITHUB_CLIENT_SECRET: v.pipe(v.string(), v.minLength(1)),
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
