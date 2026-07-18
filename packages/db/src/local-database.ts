const LOCAL_DATABASE_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
])
const REPOSITORY_LOCAL_TURSO_HOSTNAME = "db.enterprise-agentic-saas.localhost"

export const assertLocalDatabaseUrl = (databaseUrl: string) => {
  try {
    const { hostname, protocol } = new URL(databaseUrl)
    const normalizedHostname = hostname.toLowerCase()
    if (
      protocol === "file:" &&
      (normalizedHostname === "" ||
        LOCAL_DATABASE_HOSTNAMES.has(normalizedHostname))
    ) {
      return
    }
    if (
      protocol !== "file:" &&
      (LOCAL_DATABASE_HOSTNAMES.has(normalizedHostname) ||
        normalizedHostname.endsWith(".localhost"))
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

/** 固定のlocal Turso stateとWrangler stateを一緒に消すroot reset専用境界。 */
export const assertRepositoryLocalTursoUrl = (databaseUrl: string) => {
  assertLocalDatabaseUrl(databaseUrl)

  try {
    const url = new URL(databaseUrl)
    if (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === REPOSITORY_LOCAL_TURSO_HOSTNAME &&
      url.port === "" &&
      url.pathname === "/" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    ) {
      return
    }
  } catch {
    // The shared error below intentionally avoids reflecting the configured URL.
  }

  throw new Error(
    "Local development reset requires the repository-managed Portless Turso URL."
  )
}
