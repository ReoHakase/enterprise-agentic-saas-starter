import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

import { assertLocalDatabaseUrl } from "./local-database"
import { seedDevelopmentDatabase, type DatabaseConnectionOptions } from "./seed"

export const RESET_CONFIRMATION = "reset-local-development"

const migrationsFolder = new URL("../../drizzle-v3", import.meta.url).pathname

export const assertLocalDatabase = (
  databaseUrl: string,
  confirmation: string | undefined
) => {
  assertLocalDatabaseUrl(databaseUrl)

  if (confirmation !== RESET_CONFIRMATION) {
    throw new Error(
      `Refusing destructive reset. Re-run with CONFIRM_DB_RESET=${RESET_CONFIRMATION}.`
    )
  }
}

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`

export const resetLocalDevelopmentDatabase = async (
  connection: DatabaseConnectionOptions,
  confirmation: string | undefined
) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development database reset is disabled in production.")
  }
  assertLocalDatabase(connection.url, confirmation)

  const client = createClient({
    url: connection.url,
    authToken: connection.authToken,
  })

  try {
    // Reset the whole explicitly selected local database, including Drizzle's
    // ledger. Applying migrations afterwards is the only schema creation path.
    await client.execute("PRAGMA foreign_keys=OFF")
    const tables = await client.execute(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
    )
    const dropStatements = tables.rows.map(
      (row) => `DROP TABLE IF EXISTS ${quoteIdentifier(String(row.name))}`
    )
    if (dropStatements.length > 0) {
      await client.batch(dropStatements)
    }
    await client.execute("PRAGMA foreign_keys=ON")

    await migrate(drizzle({ client }), { migrationsFolder })
  } finally {
    client.close()
  }

  await seedDevelopmentDatabase(connection)
}

const main = async () => {
  const { env } = await import("../env")
  await resetLocalDevelopmentDatabase(
    {
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    },
    process.env.CONFIRM_DB_RESET
  )
  console.log("Local development database reset completed.")
}

if (import.meta.main) {
  await main()
}
