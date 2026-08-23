import { defineConfig } from "drizzle-kit"

import { env } from "./src/env"

export default defineConfig({
  out: "./drizzle-v3",
  schema: "./src/schema/index.ts",
  dialect: "turso",
  dbCredentials: {
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  },
})
