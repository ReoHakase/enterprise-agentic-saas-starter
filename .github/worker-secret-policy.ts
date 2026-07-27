import { readFile } from "node:fs/promises"

export const staleWorkerSecrets = {
  agent: ["TURSO_AUTH_TOKEN", "TURSO_DATABASE_URL"],
  api: ["MASTRA_STORAGE_AUTH_TOKEN", "MASTRA_STORAGE_URL"],
} as const

export type WorkerKind = keyof typeof staleWorkerSecrets

export const parseWorkerSecretInventory = (value: unknown): string[] => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("success" in value) ||
    value.success !== true ||
    !("result" in value) ||
    !Array.isArray(value.result)
  ) {
    throw new Error("Cloudflare Worker secret inventory is invalid")
  }

  return value.result.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("name" in entry) ||
      typeof entry.name !== "string"
    ) {
      throw new Error("Cloudflare Worker secret inventory entry is invalid")
    }
    return entry.name
  })
}

export const findStaleWorkerSecrets = (
  worker: WorkerKind,
  inventory: readonly string[]
) => staleWorkerSecrets[worker].filter((name) => inventory.includes(name))

export const assertNoStaleWorkerSecrets = (
  worker: WorkerKind,
  inventory: readonly string[]
) => {
  const stale = findStaleWorkerSecrets(worker, inventory)
  if (stale.length > 0) {
    throw new Error(
      `${worker} Worker contains forbidden cross-database secrets: ${stale.join(", ")}`
    )
  }
}

if (import.meta.main) {
  const [command, worker, inventoryPath] = process.argv.slice(2)
  if (
    (command !== "stale" && command !== "assert") ||
    (worker !== "agent" && worker !== "api") ||
    !inventoryPath
  ) {
    throw new Error(
      "Usage: worker-secret-policy.ts <stale|assert> <agent|api> <inventory.json>"
    )
  }
  const inventory = parseWorkerSecretInventory(
    JSON.parse(await readFile(inventoryPath, "utf8"))
  )
  if (command === "stale") {
    process.stdout.write(
      `${findStaleWorkerSecrets(worker, inventory).join("\n")}\n`
    )
  } else {
    assertNoStaleWorkerSecrets(worker, inventory)
  }
}
