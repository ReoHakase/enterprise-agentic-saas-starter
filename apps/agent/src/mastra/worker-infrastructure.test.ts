import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { createAgentEvalConfigs } from "./evals/stack-config"

const repositoryRoot = resolve(import.meta.dirname, "../../../..")

const readJsonc = async (path: string) => {
  const script =
    "const value = Bun.JSONC.parse(await Bun.file(process.argv[1]).text()); process.stdout.write(JSON.stringify(value))"
  return await new Promise<Record<string, unknown>>((resolveResult, reject) => {
    const child = spawn("bun", ["-e", script, path])
    let stderr = ""
    let stdout = ""
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk
    })
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk
    })
    child.once("error", reject)
    child.once("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`Bun JSONC parsing failed: ${stderr}`))
        return
      }
      const parsed: Record<string, unknown> = JSON.parse(stdout)
      resolveResult(parsed)
    })
  })
}

describe("Mastra Studio development configuration", () => {
  it("uses the Portless browser origin for Studio API requests", async () => {
    const packageJson = await readJsonc(
      join(repositoryRoot, "apps/agent/package.json")
    )
    const scripts = packageJson.scripts
    if (typeof scripts !== "object" || scripts === null) {
      throw new TypeError("apps/agent/package.json scripts must be an object")
    }
    const studioScript = Reflect.get(scripts, "dev:studio")

    expect(studioScript).toBeTypeOf("string")
    expect(studioScript).toContain("MASTRA_AUTO_DETECT_URL=true")
    expect(studioScript).toContain(
      "portless-topology run mastra-studio.enterprise-agentic-saas"
    )
  })
})

describe("mutual Worker Service Binding deployment", () => {
  it("keeps the bootstrap API config identical except for outbound services", async () => {
    const finalConfig = await readJsonc(
      join(repositoryRoot, "apps/api/wrangler.jsonc")
    )
    const bootstrapConfig = await readJsonc(
      join(repositoryRoot, "apps/api/wrangler.bootstrap.jsonc")
    )
    const agentConfig = await readJsonc(
      join(repositoryRoot, "apps/agent/wrangler.jsonc")
    )
    const { services, ...finalConfigWithoutServices } = finalConfig

    expect(services).toEqual([
      {
        binding: "AGENT_RUNTIME",
        entrypoint: "AgentRuntime",
        service: "enterprise-agentic-saas-agent",
      },
    ])
    expect(bootstrapConfig).toEqual(finalConfigWithoutServices)
    expect(bootstrapConfig).not.toHaveProperty("services")
    expect(finalConfig.compatibility_flags).toEqual([
      "nodejs_compat",
      "enable_request_signal",
      "request_signal_passthrough",
    ])
    expect(agentConfig.compatibility_flags).toEqual([
      "nodejs_compat",
      "enable_request_signal",
    ])
    expect(agentConfig.compatibility_flags).not.toContain(
      "request_signal_passthrough"
    )
    expect(agentConfig.services).toEqual([
      {
        binding: "AGENT_INTERNAL_API",
        entrypoint: "AgentInternalApi",
        service: finalConfig.name,
      },
    ])
    expect(agentConfig.exports).toEqual({
      IssueAssistant: {
        state: "deleted",
        type: "durable-object",
      },
    })
    expect(agentConfig.main).toBe("src/mastra/worker.ts")
    expect(agentConfig).not.toHaveProperty("migrations")
    expect(agentConfig).not.toHaveProperty("durable_objects")
    const generatedAgentTypes = await readFile(
      join(repositoryRoot, "apps/agent/src/cloudflare-env.d.ts"),
      "utf8"
    )
    expect(generatedAgentTypes).not.toContain("IssueAssistant")
  })

  it("isolates the scripted E2E entrypoint from production", async () => {
    const productionConfig = await readJsonc(
      join(repositoryRoot, "apps/agent/wrangler.jsonc")
    )
    const e2eConfig = await readJsonc(
      join(repositoryRoot, "apps/agent/wrangler.e2e.jsonc")
    )
    const productionWorker = await readFile(
      join(repositoryRoot, "apps/agent/src/mastra/worker.ts"),
      "utf8"
    )
    const e2eWorker = await readFile(
      join(repositoryRoot, "apps/agent/src/mastra/e2e/worker.ts"),
      "utf8"
    )

    expect(e2eConfig.main).toBe("src/mastra/e2e/worker.ts")
    expect(e2eConfig).not.toHaveProperty("exports")
    expect(e2eConfig).not.toHaveProperty("migrations")
    expect(JSON.stringify(productionConfig)).not.toContain("wrangler.e2e.jsonc")
    expect(productionWorker).not.toContain("/e2e/")
    expect(productionWorker).not.toContain("/test-support/")
    expect(productionWorker).not.toContain("SCRIPTED_MODEL_SENTINEL")
    expect(productionWorker).not.toContain("IssueAssistant")
    expect(e2eWorker).not.toContain("IssueAssistant")
    expect(productionWorker).not.toMatch(
      /OPENROUTER_API_KEY.*(?:scripted|mock)/iu
    )
  })

  it("keeps the retired namespace out of local eval Worker configs", () => {
    const configs = createAgentEvalConfigs({
      agentDatabaseOrigin: "http://127.0.0.1:42001",
      agentName: "agent-eval",
      apiName: "api-eval",
      apiOrigin: "http://127.0.0.1:42002",
      availableTools: [],
      databaseOrigin: "http://127.0.0.1:42003",
      namespace: "worker-infrastructure-test",
    })

    expect(configs.agent).not.toHaveProperty("exports")
    expect(configs.agent).not.toHaveProperty("migrations")
    expect(JSON.stringify(configs.agent)).not.toContain("IssueAssistant")
  })

  it("deploys Agent before the final API and gates bootstrap on remote state", async () => {
    const workflow = await readFile(
      join(repositoryRoot, ".github/workflows/deploy.yml"),
      "utf8"
    )
    const compatibilityDeploy = workflow.indexOf(
      "- name: Deploy compatible API Worker before migration"
    )
    const agentDeploy = workflow.indexOf("- name: Deploy Agent Worker")
    const finalApiDeploy = workflow.indexOf("- name: Deploy final API Worker")

    expect(workflow).toContain("id: worker-state")
    expect(workflow).toContain("force_agent_protocol_bootstrap:")
    expect(workflow).toContain(
      'bootstrap_required="${{ inputs.force_agent_protocol_bootstrap }}"'
    )
    expect(workflow).toContain("API_WORKER_NAME: enterprise-agentic-saas-api")
    expect(workflow).toContain(
      "AGENT_WORKER_NAME: enterprise-agentic-saas-agent"
    )
    expect(workflow).toContain("apps/api/wrangler.bootstrap.jsonc")
    expect(workflow).toContain(
      '"${{ steps.worker-state.outputs.bootstrap_required }}"'
    )
    expect(workflow).toContain("404)")
    expect(workflow).toContain("worker_exists=false")
    expect(workflow).toContain("bootstrap_required=true")
    expect(workflow).toContain("Cloudflare Worker state lookup failed")
    expect(compatibilityDeploy).toBeGreaterThan(-1)
    expect(workflow).toContain("--config apps/api/wrangler.bootstrap.jsonc")
    expect(agentDeploy).toBeGreaterThan(compatibilityDeploy)
    expect(finalApiDeploy).toBeGreaterThan(agentDeploy)
  })
})
