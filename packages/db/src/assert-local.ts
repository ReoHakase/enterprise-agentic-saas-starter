import { env } from "./env"
import { assertLocalDatabaseUrl } from "./local-database"

if (process.env.NODE_ENV === "production") {
  throw new Error("Development database bootstrap is disabled in production.")
}

assertLocalDatabaseUrl(env.TURSO_DATABASE_URL)
