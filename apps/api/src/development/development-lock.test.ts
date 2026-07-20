import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { createClient } from "@libsql/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  acquireDevelopmentLease,
  DevelopmentLockBusyError,
  type DevelopmentLease,
} from "./development-lock"

describe("development process lease", () => {
  let databasePath = ""
  let directory = ""

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "development-lock-"))
    databasePath = join(directory, "leases.db")
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  const acquire = (options: { pid?: number; token?: string } = {}) =>
    acquireDevelopmentLease({
      databasePath,
      label: "Local API Worker",
      name: "local-api-worker",
      ...options,
    })

  it("prevents two live local Worker owners", async () => {
    const lease = await acquire()

    await expect(acquire()).rejects.toBeInstanceOf(DevelopmentLockBusyError)
    await lease.release()
    const replacement = await acquire()
    await replacement.release()
  })

  it("serializes simultaneous acquisition attempts", async () => {
    const results = await Promise.allSettled([acquire(), acquire()])
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<DevelopmentLease> =>
        result.status === "fulfilled"
    )
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toBeInstanceOf(DevelopmentLockBusyError)
    await fulfilled[0]?.value.release()
  })

  it("waits through cross-client SQLite contention before reporting the live owner", async () => {
    const lease = await acquire()
    const client = createClient({ url: pathToFileURL(databasePath).href })
    const transaction = await client.transaction("write")
    const contender = acquire()

    await new Promise((resolve) => setTimeout(resolve, 50))
    await transaction.commit()
    transaction.close()
    client.close()

    await expect(contender).rejects.toBeInstanceOf(DevelopmentLockBusyError)
    await lease.release()
  })

  it("waits through cross-client SQLite contention while releasing", async () => {
    const lease = await acquire()
    const client = createClient({ url: pathToFileURL(databasePath).href })
    const transaction = await client.transaction("write")
    const release = lease.release()

    await new Promise((resolve) => setTimeout(resolve, 50))
    await transaction.commit()
    transaction.close()
    client.close()

    await expect(release).resolves.toBeUndefined()
    const replacement = await acquire()
    await replacement.release()
  })

  it("atomically replaces a lease left by a dead process", async () => {
    const stale = await acquire({ pid: 2_147_483_647 })
    const recovered = await acquire()

    await stale.release()
    await expect(acquire()).rejects.toBeInstanceOf(DevelopmentLockBusyError)
    await recovered.release()
  })

  it("does not delete a replacement lease with an old token", async () => {
    const token = "original-token".repeat(4)
    const lease = await acquire({ token })
    const client = createClient({ url: pathToFileURL(databasePath).href })
    try {
      await client.execute({
        sql: "UPDATE development_leases SET token = ? WHERE name = ?",
        args: ["replacement-token".repeat(4), "local-api-worker"],
      })
    } finally {
      client.close()
    }

    await lease.release()
    await expect(acquire()).rejects.toBeInstanceOf(DevelopmentLockBusyError)
  })
})
