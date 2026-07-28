import { spawn } from "node:child_process"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "../../../..")
const wrapperPath = join(repositoryRoot, "scripts/wrangler-dev-portless.sh")
const temporaryDirectories: string[] = []

const createWranglerStub = async () => {
  const directory = await mkdtemp(join(tmpdir(), "wrangler-portless-test-"))
  temporaryDirectories.push(directory)
  const executable = join(directory, "wrangler")
  await writeFile(
    executable,
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$WRANGLER_ARGUMENTS_FILE"\n'
  )
  await chmod(executable, 0o755)
  return directory
}

const runWrapper = async (environment: Record<string, string | undefined>) => {
  const childEnvironment = { ...process.env }
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete childEnvironment[name]
    else childEnvironment[name] = value
  }

  return await new Promise<{
    exitCode: number | null
    stderr: string
    stdout: string
  }>((resolveResult, reject) => {
    const child = spawn("sh", [wrapperPath], {
      cwd: join(repositoryRoot, "apps/api"),
      env: childEnvironment,
    })
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
      resolveResult({ exitCode, stderr, stdout })
    })
  })
}

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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

describe("wrangler-dev-portless", () => {
  it("lets the OS allocate a collision-free inspector port by default", async () => {
    const stubDirectory = await createWranglerStub()
    const argumentsFile = join(stubDirectory, "arguments.txt")
    const result = await runWrapper({
      PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
      PORT: "43123",
      WRANGLER_ARGUMENTS_FILE: argumentsFile,
      WRANGLER_INSPECTOR_PORT: undefined,
    })

    expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" })
    expect((await readFile(argumentsFile, "utf8")).trim().split("\n")).toEqual([
      "dev",
      "--port",
      "43123",
      "--inspector-port",
      "0",
      "--env-file",
      ".dev.vars.example",
      "--env-file",
      ".env.local",
    ])
  })

  it("accepts an explicit inspector port for a stable devtools endpoint", async () => {
    const stubDirectory = await createWranglerStub()
    const argumentsFile = join(stubDirectory, "arguments.txt")
    const result = await runWrapper({
      PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
      PORT: "43124",
      WRANGLER_ARGUMENTS_FILE: argumentsFile,
      WRANGLER_INSPECTOR_PORT: "9234",
    })

    expect(result.exitCode).toBe(0)
    expect(await readFile(argumentsFile, "utf8")).toContain(
      "--inspector-port\n9234\n"
    )
  })

  it("rejects missing Portless input and malformed inspector overrides", async () => {
    const missingPort = await runWrapper({ PORT: undefined })
    expect(missingPort.exitCode).toBe(1)
    expect(missingPort.stderr).toContain("PORT is required")

    const invalidInspector = await runWrapper({
      PORT: "43125",
      WRANGLER_INSPECTOR_PORT: "not-a-port",
    })
    expect(invalidInspector.exitCode).toBe(1)
    expect(invalidInspector.stderr).toContain(
      "WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535"
    )

    const inspectorOverflow = await runWrapper({
      PORT: "43126",
      WRANGLER_INSPECTOR_PORT: "65536",
    })
    expect(inspectorOverflow.exitCode).toBe(1)
    expect(inspectorOverflow.stderr).toContain(
      "WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535"
    )
  })
})

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
    expect(agentConfig.services).toEqual([
      {
        binding: "AGENT_INTERNAL_API",
        entrypoint: "AgentInternalApi",
        service: finalConfig.name,
      },
    ])
    expect(agentConfig.migrations).toEqual([
      {
        new_sqlite_classes: ["IssueAssistant"],
        tag: "v1",
      },
    ])
    expect(agentConfig.main).toBe("src/mastra/worker.ts")
    expect(agentConfig).not.toHaveProperty("deleted_classes")
    expect(agentConfig).not.toHaveProperty("durable_objects")
    const generatedAgentTypes = await readFile(
      join(repositoryRoot, "apps/agent/src/cloudflare-env.d.ts"),
      "utf8"
    )
    expect(generatedAgentTypes).toContain('durableNamespaces: "IssueAssistant"')
    expect(generatedAgentTypes).not.toContain(
      "IssueAssistant: DurableObjectNamespace"
    )
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

    expect(e2eConfig.main).toBe("src/mastra/e2e/worker.ts")
    expect(e2eConfig.migrations).toEqual(productionConfig.migrations)
    expect(e2eConfig).not.toHaveProperty("deleted_classes")
    expect(JSON.stringify(productionConfig)).not.toContain("wrangler.e2e.jsonc")
    expect(productionWorker).not.toContain("/e2e/")
    expect(productionWorker).not.toContain("/test-support/")
    expect(productionWorker).not.toContain("SCRIPTED_MODEL_SENTINEL")
    expect(productionWorker).not.toMatch(
      /OPENROUTER_API_KEY.*(?:scripted|mock)/iu
    )
  })

  it("deploys Agent before the final API and gates bootstrap on remote state", async () => {
    const workflow = await readFile(
      join(repositoryRoot, ".github/workflows/deploy.yml"),
      "utf8"
    )
    const bootstrapDeploy = workflow.indexOf(
      "- name: Bootstrap API Worker for mutual Service Bindings"
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
      "steps.worker-state.outputs.bootstrap_required == 'true'"
    )
    expect(workflow).toContain("404) bootstrap_required=true")
    expect(workflow).toContain("Cloudflare Worker state lookup failed")
    expect(bootstrapDeploy).toBeGreaterThan(-1)
    expect(agentDeploy).toBeGreaterThan(bootstrapDeploy)
    expect(finalApiDeploy).toBeGreaterThan(agentDeploy)
  })
})
