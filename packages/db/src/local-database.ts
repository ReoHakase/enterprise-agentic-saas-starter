const LOCAL_DATABASE_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
])

export const assertLocalDatabaseUrl = (databaseUrl: string) => {
  if (/^file:/i.test(databaseUrl)) return

  try {
    const { hostname } = new URL(databaseUrl)
    const normalizedHostname = hostname.toLowerCase()
    if (
      LOCAL_DATABASE_HOSTNAMES.has(normalizedHostname) ||
      normalizedHostname.endsWith(".localhost")
    ) {
      return
    }
  } catch {
    // The shared error below intentionally avoids reflecting credentials.
  }

  throw new Error(
    "Development database operations are restricted to file: databases and localhost URLs."
  )
}
