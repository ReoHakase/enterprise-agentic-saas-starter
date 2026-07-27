import { readFile } from "node:fs/promises"

export type WorkerBindingInventoryEntry = {
  entrypoint?: string
  name: string
  service?: string
  text?: string
  type?: string
}

const optionalString = (
  entry: Record<string, unknown>,
  property: string
): string | undefined => {
  if (!(property in entry)) return undefined
  const value = entry[property]
  if (typeof value !== "string") {
    throw new Error("Cloudflare Worker binding inventory entry is invalid")
  }
  return value
}

export const parseWorkerBindingInventory = (
  value: unknown
): WorkerBindingInventoryEntry[] => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("success" in value) ||
    value.success !== true ||
    !("result" in value) ||
    typeof value.result !== "object" ||
    value.result === null ||
    !("bindings" in value.result) ||
    !Array.isArray(value.result.bindings)
  ) {
    throw new Error("Cloudflare Worker binding inventory is invalid")
  }

  return value.result.bindings.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("name" in entry) ||
      typeof entry.name !== "string"
    ) {
      throw new Error("Cloudflare Worker binding inventory entry is invalid")
    }
    const binding: Record<string, unknown> = entry
    const entrypoint = optionalString(binding, "entrypoint")
    const service = optionalString(binding, "service")
    const text = optionalString(binding, "text")
    const type = optionalString(binding, "type")
    return {
      name: entry.name,
      ...(entrypoint === undefined ? {} : { entrypoint }),
      ...(service === undefined ? {} : { service }),
      ...(type === undefined ? {} : { type }),
      ...(text === undefined ? {} : { text }),
    }
  })
}

export const assertAgentRuntimeBindingAbsent = (
  inventory: readonly WorkerBindingInventoryEntry[]
): void => {
  if (inventory.some(({ name }) => name === "AGENT_RUNTIME")) {
    throw new Error("Compatibility API still exposes AGENT_RUNTIME")
  }
}

export const assertAgentMaintenanceBindingEnabled = (
  inventory: readonly WorkerBindingInventoryEntry[]
): void => {
  const maintenance = inventory.find(
    ({ name }) => name === "AGENT_MAINTENANCE_MODE"
  )
  if (
    !maintenance ||
    maintenance.type !== "plain_text" ||
    maintenance.text !== "1"
  ) {
    throw new Error("Compatibility API Agent maintenance mode is not enabled")
  }
}

export const assertFinalAgentBindings = (
  inventory: readonly WorkerBindingInventoryEntry[]
): void => {
  const runtimeBindings = inventory.filter(
    ({ name }) => name === "AGENT_RUNTIME"
  )
  if (
    runtimeBindings.length !== 1 ||
    runtimeBindings[0]?.type !== "service" ||
    runtimeBindings[0].service !== "enterprise-agentic-saas-agent" ||
    runtimeBindings[0].entrypoint !== "AgentRuntime"
  ) {
    throw new Error("Final API does not expose the expected AGENT_RUNTIME")
  }
  const maintenance = inventory.find(
    ({ name }) => name === "AGENT_MAINTENANCE_MODE"
  )
  if (
    !maintenance ||
    maintenance.type !== "plain_text" ||
    maintenance.text !== "0"
  ) {
    throw new Error("Final API Agent maintenance mode is not disabled")
  }
}

if (import.meta.main) {
  const [mode, inventoryPath] = process.argv.slice(2)
  if ((mode !== "compatibility" && mode !== "final") || !inventoryPath) {
    throw new Error(
      "Usage: worker-binding-policy.ts <compatibility|final> <inventory.json>"
    )
  }
  const inventory = parseWorkerBindingInventory(
    JSON.parse(await readFile(inventoryPath, "utf8"))
  )
  if (mode === "compatibility") {
    assertAgentRuntimeBindingAbsent(inventory)
    assertAgentMaintenanceBindingEnabled(inventory)
  } else {
    assertFinalAgentBindings(inventory)
  }
}
