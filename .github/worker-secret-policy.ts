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

export const assertNoNewStaleWorkerSecrets = (
  worker: WorkerKind,
  initialInventory: readonly string[],
  currentInventory: readonly string[]
) => {
  const initial = new Set(findStaleWorkerSecrets(worker, initialInventory))
  const newlyStale = findStaleWorkerSecrets(worker, currentInventory).filter(
    (name) => !initial.has(name)
  )
  if (newlyStale.length > 0) {
    throw new Error(
      `${worker} Worker gained forbidden cross-database secrets after initial inventory: ${newlyStale.join(", ")}`
    )
  }
}

if (import.meta.main) {
  const [command, worker, inventoryPath, currentInventoryPath] =
    process.argv.slice(2)
  if (
    (command !== "stale" &&
      command !== "assert" &&
      command !== "assert-no-new") ||
    (worker !== "agent" && worker !== "api") ||
    !inventoryPath ||
    (command === "assert-no-new" && !currentInventoryPath)
  ) {
    throw new Error(
      "Usage: worker-secret-policy.ts <stale|assert|assert-no-new> <agent|api> <inventory.json> [current-inventory.json]"
    )
  }
  const inventory = parseWorkerSecretInventory(
    JSON.parse(await readFile(inventoryPath, "utf8"))
  )
  if (command === "stale") {
    process.stdout.write(
      `${findStaleWorkerSecrets(worker, inventory).join("\n")}\n`
    )
  } else if (command === "assert") {
    assertNoStaleWorkerSecrets(worker, inventory)
  } else {
    if (!currentInventoryPath) {
      throw new Error("Current Worker secret inventory path is required")
    }
    const currentInventory = parseWorkerSecretInventory(
      JSON.parse(await readFile(currentInventoryPath, "utf8"))
    )
    assertNoNewStaleWorkerSecrets(worker, inventory, currentInventory)
  }
}
