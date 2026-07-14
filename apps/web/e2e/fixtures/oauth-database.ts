import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const DATABASE_FILE_PATTERN =
  /^enterprise-agentic-saas-oauth-e2e-[1-9][0-9]*\.db$/
const temporaryDirectory = resolve(tmpdir())

const validateOAuthDatabasePath = (databasePath: string) => {
  const resolvedPath = resolve(databasePath)

  if (
    dirname(resolvedPath) !== temporaryDirectory ||
    !DATABASE_FILE_PATTERN.test(basename(resolvedPath))
  ) {
    throw new Error("OAuth E2E database path is outside its temporary boundary")
  }

  return resolvedPath
}

export const createOAuthDatabasePath = (processId: number) => {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error("OAuth E2E requires a positive process identifier")
  }

  return validateOAuthDatabasePath(
    join(
      temporaryDirectory,
      `enterprise-agentic-saas-oauth-e2e-${processId}.db`
    )
  )
}

export const parseOAuthDatabaseUrl = (databaseUrl: string) => {
  let databasePath: string

  try {
    databasePath = fileURLToPath(new URL(databaseUrl))
  } catch {
    throw new Error("OAuth E2E requires a valid file database URL")
  }

  return validateOAuthDatabasePath(databasePath)
}

export const removeOAuthDatabaseFiles = async (databasePath: string) => {
  const validatedPath = validateOAuthDatabasePath(databasePath)

  await Promise.all(
    [validatedPath, `${validatedPath}-shm`, `${validatedPath}-wal`].map(
      (path) => rm(path, { force: true })
    )
  )
}
