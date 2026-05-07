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
  },
  isServer: true,
  env: process.env,
})
