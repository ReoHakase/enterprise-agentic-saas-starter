import { describe, expect, it } from "vitest"

import {
  assertNoNewStaleWorkerSecrets,
  assertNoStaleWorkerSecrets,
  findStaleWorkerSecrets,
  parseWorkerSecretInventory,
} from "./worker-secret-policy"

describe("Worker secret inventory policy", () => {
  it("rejects only the cross-database secrets for each Worker", () => {
    const inventory = [
      "MASTRA_STORAGE_AUTH_TOKEN",
      "MASTRA_STORAGE_URL",
      "TURSO_AUTH_TOKEN",
      "TURSO_DATABASE_URL",
      "UNRELATED_SECRET",
    ]

    expect(findStaleWorkerSecrets("agent", inventory)).toEqual([
      "TURSO_AUTH_TOKEN",
      "TURSO_DATABASE_URL",
    ])
    expect(findStaleWorkerSecrets("api", inventory)).toEqual([
      "MASTRA_STORAGE_AUTH_TOKEN",
      "MASTRA_STORAGE_URL",
    ])
    expect(() =>
      assertNoStaleWorkerSecrets("agent", ["MASTRA_STORAGE_URL"])
    ).not.toThrow()
  })

  it("fails closed for malformed Cloudflare inventory responses", () => {
    expect(() =>
      parseWorkerSecretInventory({ success: false, result: [] })
    ).toThrow("inventory is invalid")
    expect(() =>
      parseWorkerSecretInventory({ success: true, result: [{}] })
    ).toThrow("entry is invalid")
  })

  it("rejects forbidden secrets that appear after the initial inventory", () => {
    expect(() =>
      assertNoNewStaleWorkerSecrets(
        "api",
        ["MASTRA_STORAGE_URL"],
        ["MASTRA_STORAGE_URL", "MASTRA_STORAGE_AUTH_TOKEN"]
      )
    ).toThrow("gained forbidden cross-database secrets")
    expect(() =>
      assertNoNewStaleWorkerSecrets(
        "api",
        ["MASTRA_STORAGE_URL", "MASTRA_STORAGE_AUTH_TOKEN"],
        ["MASTRA_STORAGE_URL"]
      )
    ).not.toThrow()
  })
})
