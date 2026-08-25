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

describe("development process leaseの契約", () => {
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

  it("稼働中のlocal Worker ownerを2つ同時に許可しない", async () => {
    const lease = await acquire()

    await expect(acquire()).rejects.toBeInstanceOf(DevelopmentLockBusyError)
    await lease.release()
    const replacement = await acquire()
    await replacement.release()
  })

  it("同時のlease取得を直列化する", async () => {
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

  it("別clientとのSQLite競合を待って稼働中ownerを報告する", async () => {
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

  it("lease解放中の別clientとのSQLite競合を待つ", async () => {
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

  it("終了済みprocessが残したleaseを原子的に置き換える", async () => {
    const stale = await acquire({ pid: 2_147_483_647 })
    const recovered = await acquire()

    await stale.release()
    await expect(acquire()).rejects.toBeInstanceOf(DevelopmentLockBusyError)
    await recovered.release()
  })

  it("古いtokenで置換後のleaseを削除しない", async () => {
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
