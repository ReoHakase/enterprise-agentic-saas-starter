import { describe, expect, it } from "vitest"

import {
  assertNoNewStaleWorkerSecrets,
  assertNoStaleWorkerSecrets,
  findStaleWorkerSecrets,
  parseWorkerSecretInventory,
} from "./worker-secret-policy"

describe("Worker secret inventory policyの契約", () => {
  it("各Workerのcross-database secretだけを拒否する", () => {
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

  it("不正Cloudflare inventory responseを安全側に失敗させる", () => {
    expect(() =>
      parseWorkerSecretInventory({ success: false, result: [] })
    ).toThrow("inventory is invalid")
    expect(() =>
      parseWorkerSecretInventory({ success: true, result: [{}] })
    ).toThrow("entry is invalid")
  })

  it("初回inventory後に現れた禁止secretを拒否する", () => {
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
