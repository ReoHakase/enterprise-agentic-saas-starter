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

export const env = defineEnv({
  server: {
    APP_NAME: v.fallback(
      v.pipe(v.string(), v.minLength(1)),
      "Enterprise Agentic SaaS"
    ),
    BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(1)),
    BETTER_AUTH_URL: v.pipe(v.string(), v.minLength(1)),
    GITHUB_CLIENT_ID: v.pipe(v.string(), v.minLength(1)),
    GITHUB_CLIENT_SECRET: v.pipe(v.string(), v.minLength(1)),
    TRUSTED_ORIGINS: commaSeparatedList,
    EMAIL_PROVIDER: v.pipe(
      v.optional(v.string(), "console"),
      v.picklist(["console", "noop"])
    ),
  },
  isServer: true,
  env: process.env,
})
