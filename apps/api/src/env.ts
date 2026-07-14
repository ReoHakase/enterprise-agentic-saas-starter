import { resolveEmailFrom } from "@enterprise-agentic-saas/email/config"
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

const portSchema = v.pipe(
  v.optional(v.string()),
  v.transform((input) => (input ? Number(input) : 3001)),
  v.number(),
  v.minValue(1)
)

const nodeEnvSchema = v.pipe(
  v.optional(v.string(), "development"),
  v.picklist(["development", "test", "production"])
)

const optionalNonEmptyString = v.pipe(
  v.optional(v.string()),
  v.transform((input) => input?.trim() || undefined)
)

const sampleRate = v.pipe(
  v.optional(v.string(), "0.1"),
  v.transform(Number),
  v.number(),
  v.minValue(0),
  v.maxValue(1)
)

const emailFromSchema = v.pipe(
  v.optional(v.string()),
  v.transform((input) => resolveEmailFrom(input, process.env.NODE_ENV)),
  v.string(),
  v.email()
)

export const env = defineEnv({
  shared: {
    NODE_ENV: nodeEnvSchema,
  },
  server: {
    PORT: portSchema,
    APP_NAME: v.fallback(
      v.pipe(v.string(), v.minLength(1)),
      "Enterprise Agentic SaaS"
    ),
    APP_BASE_URL: v.fallback(
      v.pipe(v.string(), v.minLength(1)),
      "http://localhost:3000"
    ),
    API_PUBLIC_URL: v.pipe(
      v.optional(v.string()),
      v.transform((input) => {
        const port = Number(process.env.PORT) || 3001
        return input && input.length > 0 ? input : `http://localhost:${port}`
      }),
      v.pipe(v.string(), v.minLength(1))
    ),
    CORS_ORIGIN: v.pipe(
      commaSeparatedList,
      v.transform((list) => {
        const base = process.env.APP_BASE_URL?.trim() || "http://localhost:3000"
        return list.length > 0 ? list : [base]
      })
    ),
    EMAIL_PROVIDER: v.pipe(
      v.optional(v.string(), "console"),
      v.picklist(["cloudflare", "console", "noop"])
    ),
    EMAIL_FROM: emailFromSchema,
    SENTRY_DSN: optionalNonEmptyString,
    SENTRY_ENVIRONMENT: optionalNonEmptyString,
    SENTRY_RELEASE: optionalNonEmptyString,
    SENTRY_SPOTLIGHT: optionalNonEmptyString,
    SENTRY_TRACES_SAMPLE_RATE: sampleRate,
  },
  isServer: true,
  env: process.env,
})
