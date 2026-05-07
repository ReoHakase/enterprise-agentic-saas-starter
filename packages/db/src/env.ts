import { defineEnv } from "envin"
import * as v from "valibot"

export const env = defineEnv({
  server: {
    TURSO_DATABASE_URL: v.pipe(v.string(), v.minLength(1)),
    TURSO_AUTH_TOKEN: v.optional(v.pipe(v.string(), v.minLength(1))),
  },
  isServer: true,
  env: process.env,
})
