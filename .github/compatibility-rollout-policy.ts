export const requiresCompatibilityRollout = ({
  bootstrapRequired,
  staleWorkerSecretsFound,
}: {
  bootstrapRequired: boolean
  staleWorkerSecretsFound: boolean
}): boolean => bootstrapRequired || staleWorkerSecretsFound

export const allowsMissingWorkerSecretInventory = ({
  inventoryStatus,
  workerExists,
}: {
  inventoryStatus: number
  workerExists: boolean
}): boolean => !workerExists && inventoryStatus === 404

const parseBoolean = (value: string | undefined): boolean => {
  if (value === "true") return true
  if (value === "false") return false
  throw new Error("Compatibility rollout inputs must be true or false")
}

if (import.meta.main) {
  const [commandOrBootstrap, first, second] = process.argv.slice(2)
  if (commandOrBootstrap === "inventory-missing-allowed") {
    const inventoryStatus = Number(second)
    if (!Number.isInteger(inventoryStatus)) {
      throw new Error("Worker secret inventory status must be an integer")
    }
    process.stdout.write(
      `${allowsMissingWorkerSecretInventory({
        workerExists: parseBoolean(first),
        inventoryStatus,
      })}\n`
    )
  } else {
    process.stdout.write(
      `${requiresCompatibilityRollout({
        bootstrapRequired: parseBoolean(commandOrBootstrap),
        staleWorkerSecretsFound: parseBoolean(first),
      })}\n`
    )
  }
}
