import { afterEach, describe, expect, it } from "vitest"

import { createTestDatabase } from "../test-support/create-test-database"

let cleanup: (() => Promise<void>) | undefined

afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
})

describe("file-backed database concurrency", () => {
  it("preserves uniqueness across concurrent connections", async () => {
    const database = await createTestDatabase()
    cleanup = database.cleanup
    const first = database.connect()
    const second = database.connect()

    await first.execute("PRAGMA journal_mode=WAL")
    await first.execute(`
      CREATE TABLE idempotency_claims (
        id TEXT PRIMARY KEY NOT NULL,
        owner TEXT NOT NULL
      )
    `)

    const results = await Promise.allSettled([
      first.execute({
        sql: "INSERT INTO idempotency_claims(id, owner) VALUES (?, ?)",
        args: ["claim-1", "worker-a"],
      }),
      second.execute({
        sql: "INSERT INTO idempotency_claims(id, owner) VALUES (?, ?)",
        args: ["claim-1", "worker-b"],
      }),
    ])

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    )
    await expect(
      first.execute("SELECT owner FROM idempotency_claims WHERE id = 'claim-1'")
    ).resolves.toMatchObject({
      rows: [
        expect.objectContaining({ owner: expect.stringMatching(/^worker-/u) }),
      ],
    })
  })

  it("does not expose a rolled-back write to another connection", async () => {
    const database = await createTestDatabase()
    cleanup = database.cleanup
    const writer = database.connect()
    const reader = database.connect()

    await writer.execute("PRAGMA journal_mode=WAL")
    await writer.execute(
      "CREATE TABLE leases (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL)"
    )
    const transaction = await writer.transaction("write")
    await transaction.execute({
      sql: "INSERT INTO leases(id, owner) VALUES (?, ?)",
      args: ["lease-1", "worker-a"],
    })
    await transaction.rollback()

    await expect(
      reader.execute("SELECT id FROM leases WHERE id = 'lease-1'")
    ).resolves.toMatchObject({ rows: [] })
  })
})
