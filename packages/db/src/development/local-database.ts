const LOCAL_DATABASE_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
])
const REPOSITORY_LOCAL_TURSO_HOSTNAME_SUFFIX =
  ".enterprise-agentic-saas.localhost"

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

/** repositoryが管理するlocal Turso stateだけを対象にする開発用境界。 */
export const assertRepositoryLocalTursoUrl = (databaseUrl: string) => {
  assertLocalDatabaseUrl(databaseUrl)

  try {
    const url = new URL(databaseUrl)
    if (
      url.protocol === "https:" &&
      url.hostname.toLowerCase().startsWith("db.") &&
      url.hostname
        .toLowerCase()
        .endsWith(REPOSITORY_LOCAL_TURSO_HOSTNAME_SUFFIX) &&
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
    "Local development data operations require the repository-managed Portless Turso URL."
  )
}
