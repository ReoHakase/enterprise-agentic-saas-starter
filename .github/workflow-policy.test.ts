import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "vitest"

const listFiles = async (
  directory: string,
  extension: RegExp
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(directory, entry.name)
        if (
          entry.isDirectory() &&
          ![".next", ".turbo", "coverage", "dist", "node_modules"].includes(
            entry.name
          )
        ) {
          return listFiles(filePath, extension)
        }
        return entry.isFile() && extension.test(entry.name) ? [filePath] : []
      })
    )
  ).flat()
}

describe("repository quality configuration", () => {
  test("pins every remote GitHub Action to a full commit SHA", async () => {
    const files = await listFiles(".github", /\.ya?ml$/)
    const findings: string[] = []
    const contents = await Promise.all(
      files.map(async (filePath) => ({
        content: await readFile(filePath, "utf8"),
        filePath,
      }))
    )
    for (const { content, filePath } of contents) {
      for (const match of content.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
        const reference = match[1]
        if (
          reference &&
          !reference.startsWith("./") &&
          !reference.startsWith("docker://") &&
          !/^[^@\s]+@[0-9a-f]{40}$/.test(reference)
        ) {
          findings.push(`${filePath}:${reference}`)
        }
      }
    }
    expect(findings).toEqual([])
  })

  test("isolates, drains, and removes stale secrets before destructive migrations", async () => {
    const workflow = await readFile(".github/workflows/deploy.yml", "utf8")
    const inspectAt = workflow.indexOf("Inspect migration rollout state")
    const inventoryAt = workflow.indexOf(
      "Inspect cross-database Worker secret inventory"
    )
    const policyAt = workflow.indexOf(
      "Determine compatibility rollout requirement"
    )
    const killSwitchAt = workflow.indexOf(
      "Engage Agent kill switch before compatibility drain"
    )
    const deployAt = workflow.indexOf(
      "Deploy compatible API Worker before migration"
    )
    const smokeAt = workflow.indexOf(
      "Smoke compatible API Worker before migration"
    )
    const bindingAt = workflow.indexOf(
      "Verify compatibility API has no Agent runtime binding"
    )
    const drainAt = workflow.indexOf(
      "Drain live Agent capabilities before migration"
    )
    const deleteSecretsAt = workflow.indexOf(
      "Delete forbidden cross-database Worker secrets and verify inventory"
    )
    const finalInventoryAt = workflow.indexOf(
      "Reverify all Worker secret inventories before migration"
    )
    const migrateAt = workflow.indexOf("Apply Turso migrations")

    expect(inspectAt).toBeGreaterThan(-1)
    expect(inventoryAt).toBeGreaterThan(inspectAt)
    expect(policyAt).toBeGreaterThan(inventoryAt)
    expect(killSwitchAt).toBeGreaterThan(policyAt)
    expect(deployAt).toBeGreaterThan(killSwitchAt)
    expect(smokeAt).toBeGreaterThan(deployAt)
    expect(bindingAt).toBeGreaterThan(smokeAt)
    expect(drainAt).toBeGreaterThan(bindingAt)
    expect(deleteSecretsAt).toBeGreaterThan(drainAt)
    expect(finalInventoryAt).toBeGreaterThan(deleteSecretsAt)
    expect(migrateAt).toBeGreaterThan(finalInventoryAt)
    expect(workflow).toContain(
      "steps.compatibility-state.outputs.compatibility_required == 'true'"
    )
    expect(workflow).toContain("--config apps/api/wrangler.bootstrap.jsonc")
    expect(workflow).not.toContain('api_config="apps/api/wrangler.jsonc"')
    expect(workflow).toContain("/workers/scripts/$API_WORKER_NAME/settings")
    expect(workflow).toContain(".github/worker-binding-policy.ts")
    expect(workflow).toContain(".github/worker-binding-policy.ts compatibility")
    expect(workflow).toContain(".github/worker-binding-policy.ts final")
    expect(workflow).toContain("packages/db/src/agent-rollout-drain.ts")
    expect(workflow).toContain('--var "AGENT_MAINTENANCE_MODE:1"')
    expect(workflow).toContain(
      'assert_status API-compat-Agent-maintenance 503 "$API_PUBLIC_URL/agent/threads"'
    )
    expect(workflow).toContain("API-compat-Agent-assets-maintenance 503")
    expect(workflow).toContain(".github/worker-secret-policy.ts assert-no-new")
    expect(workflow).toContain(
      "$RUNNER_TEMP/initial-$worker_kind-worker-secrets.json"
    )
    expect(workflow).toContain(
      'worker_exists="${{ steps.worker-state.outputs.api_exists }}"'
    )
    expect(workflow).toContain(
      'worker_exists="${{ steps.worker-state.outputs.agent_exists }}"'
    )
    expect(workflow).toContain(
      'inventory-missing-allowed "$worker_exists" "$inventory_status"'
    )
    const finalInventory = workflow.slice(finalInventoryAt, migrateAt)
    expect(finalInventory).toContain("worker_exists=true")
    expect(finalInventory).not.toContain(
      "steps.worker-state.outputs.api_exists"
    )
    expect(finalInventory).toContain(
      ".github/worker-secret-policy.ts assert-no-new"
    )
    expect(finalInventory).toContain(".github/worker-secret-policy.ts assert")
    expect(finalInventory).toContain("for worker_kind in api agent")
    expect(workflow).not.toContain("cleanup_allowed=")
  })
})
