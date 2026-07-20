import { chmod, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"

import { createClient, type Transaction } from "@libsql/client"

export type DevelopmentLease = {
  release: () => Promise<void>
}

export class DevelopmentLockBusyError extends Error {
  constructor(label: string) {
    super(`${label} is already owned by another local process.`)
  }
}

const processIsAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    return !(cause instanceof Error && Reflect.get(cause, "code") === "ESRCH")
  }
}

const ACQUIRE_TIMEOUT_MS = 2_000
const ACQUIRE_RETRY_INTERVAL_MS = 25

const isSqliteBusy = (cause: unknown) =>
  cause instanceof Error &&
  (Reflect.get(cause, "code") === "SQLITE_BUSY" ||
    cause.message.includes("SQLITE_BUSY"))

const waitForLeaseDatabase = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ACQUIRE_RETRY_INTERVAL_MS)
  })

const initializeLeaseDatabase = async (databasePath: string) => {
  await mkdir(dirname(databasePath), { mode: 0o700, recursive: true })
  const client = createClient({ url: pathToFileURL(databasePath).href })
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS development_leases (
        name TEXT PRIMARY KEY NOT NULL,
        pid INTEGER NOT NULL,
        token TEXT NOT NULL
      )
    `)
    await chmod(databasePath, 0o600)
  } finally {
    client.close()
  }
}

const replaceLeaseIfAvailable = async ({
  databasePath,
  label,
  name,
  pid,
  token,
}: {
  databasePath: string
  label: string
  name: string
  pid: number
  token: string
}) => {
  await initializeLeaseDatabase(databasePath)
  const client = createClient({ url: pathToFileURL(databasePath).href })
  let transaction: Transaction | undefined
  try {
    transaction = await client.transaction("write")
    const existing = await transaction.execute({
      sql: "SELECT pid FROM development_leases WHERE name = ?",
      args: [name],
    })
    const existingPid = Number(existing.rows[0]?.pid)
    if (Number.isSafeInteger(existingPid) && processIsAlive(existingPid)) {
      throw new DevelopmentLockBusyError(label)
    }
    await transaction.execute({
      sql: `
        INSERT INTO development_leases (name, pid, token)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET pid = excluded.pid, token = excluded.token
      `,
      args: [name, pid, token],
    })
    await transaction.commit()
  } catch (cause) {
    if (transaction && !transaction.closed) await transaction.rollback()
    throw cause
  } finally {
    transaction?.close()
    client.close()
  }
}

const deleteLeaseIfOwned = async ({
  databasePath,
  name,
  token,
}: {
  databasePath: string
  name: string
  token: string
}) => {
  const client = createClient({ url: pathToFileURL(databasePath).href })
  try {
    await client.execute({
      sql: "DELETE FROM development_leases WHERE name = ? AND token = ?",
      args: [name, token],
    })
  } finally {
    client.close()
  }
}

export const acquireDevelopmentLease = async ({
  databasePath,
  label,
  name,
  pid = process.pid,
  token = `${crypto.randomUUID()}${crypto.randomUUID()}`,
}: {
  databasePath: string
  label: string
  name: string
  pid?: number
  token?: string
}): Promise<DevelopmentLease> => {
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- SQLite write contention is retried within a fixed deadline.
      await replaceLeaseIfAvailable({
        databasePath,
        label,
        name,
        pid,
        token,
      })
      break
    } catch (cause) {
      if (cause instanceof DevelopmentLockBusyError) throw cause
      if (!isSqliteBusy(cause)) {
        throw new Error("Could not acquire a local development lease.", {
          cause,
        })
      }
      if (Date.now() >= deadline) throw new DevelopmentLockBusyError(label)
    }
    // oxlint-disable-next-line no-await-in-loop -- retry spacing prevents a local SQLite busy loop.
    await waitForLeaseDatabase()
  }

  return {
    release: async () => {
      const releaseDeadline = Date.now() + ACQUIRE_TIMEOUT_MS
      for (;;) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- SQLite write contention is retried within a fixed deadline.
          await deleteLeaseIfOwned({ databasePath, name, token })
          return
        } catch (cause) {
          if (!isSqliteBusy(cause) || Date.now() >= releaseDeadline) {
            throw new Error("Could not release a local development lease.", {
              cause,
            })
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- retry spacing prevents a local SQLite busy loop.
        await waitForLeaseDatabase()
      }
    },
  }
}
