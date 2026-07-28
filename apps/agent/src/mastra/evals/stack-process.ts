import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { z } from "zod"

import {
  AGENT_STORAGE_AUTH_TOKEN,
  APPLICATION_DATABASE_AUTH_TOKEN,
  createAgentEvalConfigs,
} from "./stack-config"
import {
  type AgentEvalFixtureIdentity,
  fixtureIdentitySchema,
  seedAndVerifySentinelMemory,
  verifySentinelThroughPublicHistory,
} from "./stack-memory-isolation"

const repositoryRoot = resolve(import.meta.dirname, "../../../../..")
const apiWorkspace = resolve(repositoryRoot, "apps/api")
const databaseWorkspace = resolve(repositoryRoot, "packages/db")
const fixtureScript = resolve(
  databaseWorkspace,
  "scripts/agent-eval-fixture.ts"
)
const scopeProbeScript = resolve(
  apiWorkspace,
  "scripts/agent-eval-scope-probes.ts"
)
const wranglerBinary = resolve(apiWorkspace, "node_modules/.bin/wrangler")

const inheritedEnvironment = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "LANG", "LC_ALL"].flatMap(
    (name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    }
  )
)

type ManagedProcess = ReturnType<typeof Bun.spawn>

const usageSnapshotSchema = z
  .object({
    actions: z.array(
      z
        .object({
          completedAt: z.number().int().nonnegative().nullable(),
          canonicalPreview: z.unknown(),
          createdAt: z.number().int().nonnegative(),
          decidedAt: z.number().int().nonnegative().nullable(),
          id: z.string().min(1),
          kind: z.string().min(1),
          organizationId: z.string().min(1),
          resultId: z.string().nullable(),
          receipt: z.unknown(),
          status: z.string().min(1),
          threadId: z.string().min(1),
        })
        .passthrough()
    ),
    audits: z.array(
      z
        .object({
          action: z.string().min(1),
          organizationId: z.string().min(1),
          targetId: z.string().nullable(),
        })
        .passthrough()
    ),
    issues: z.array(
      z
        .object({
          createdAt: z.number().int().nonnegative(),
          id: z.string().min(1),
          organizationId: z.string().min(1),
          priority: z.string().min(1),
          revision: z.number().int().positive(),
          title: z.string().min(1),
        })
        .passthrough()
    ),
    usage: z.array(
      z
        .object({
          calculatedCostMicros: z.number().int().nonnegative(),
          isEstimate: z.boolean(),
          imageInputCount: z.number().int().nonnegative(),
          inputTokenCount: z.number().int().nonnegative(),
          model: z.string().min(1),
          organizationId: z.string().min(1),
          outputTokenCount: z.number().int().nonnegative(),
          pricingVersion: z.string().min(1),
          providerCostMicros: z.number().int().nonnegative().nullable(),
          runEventId: z.string().min(1),
          threadId: z.string().min(1),
        })
        .passthrough()
    ),
    runs: z.array(
      z
        .object({
          id: z.string().min(1),
          organizationId: z.string().min(1),
          status: z.string().min(1),
          threadId: z.string().min(1),
          webSearchUsedAt: z.number().int().nonnegative().nullable(),
        })
        .passthrough()
    ),
    files: z.array(
      z
        .object({
          id: z.string().min(1),
          organizationId: z.string().min(1),
          status: z.string().min(1),
        })
        .passthrough()
    ),
  })
  .passthrough()

const scopeProbeSchema = z
  .object({
    baselineGrantAccepted: z.boolean(),
    connectionReplayRejected: z.boolean(),
    expiredGrantRejected: z.boolean(),
    sideEffectsUnchanged: z.boolean(),
    staleEpochRejected: z.boolean(),
    wrongOrganizationRejected: z.boolean(),
    wrongThreadRejected: z.boolean(),
  })
  .strict()
const scopeProbeFailureStageSchema = z.enum([
  "baseline",
  "connection_replay",
  "expired_grant",
  "setup",
  "side_effect_snapshot",
  "stale_epoch",
  "wrong_organization",
  "wrong_thread",
])
const scopeProbeResultSchema = z.union([
  scopeProbeSchema,
  z.object({ failureStage: scopeProbeFailureStageSchema }).strict(),
])
export type AgentEvalStack = {
  apiOrigin: string
  close: () => Promise<void>
  databaseEnvironment: Record<string, string>
  identity: AgentEvalFixtureIdentity
}

export type AgentEvalStackUsageSnapshot = z.infer<typeof usageSnapshotSchema>

const reservePort = () =>
  new Promise<number>((resolvePromise, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        reject(new Error("Agent eval could not reserve a local port"))
        return
      }
      server.close((cause) => {
        if (cause) reject(cause)
        else resolvePromise(address.port)
      })
    })
  })

const stopProcess = async (child: ManagedProcess | undefined) => {
  if (!child || child.exitCode !== null) return
  child.kill("SIGTERM")
  const stopped = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(5_000).then(() => false),
  ])
  if (!stopped && child.exitCode === null) child.kill("SIGKILL")
  await child.exited.catch(() => undefined)
}

const waitForHttp = async (
  url: string,
  timeoutMs: number,
  service: "database" | "worker",
  processHandle?: ManagedProcess
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (processHandle?.exitCode !== null) {
      throw new Error(`Agent eval ${service} exited during startup`)
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded readiness polling is serial.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      })
      // oxlint-disable-next-line no-await-in-loop -- the response belongs to this probe.
      await response.body?.cancel()
      if (response.ok) return
    } catch {
      // Connection refusal is expected until the isolated process is ready.
    }
    // oxlint-disable-next-line no-await-in-loop -- readiness probes need spacing.
    await Bun.sleep(200)
  }
  throw new Error(`Agent eval ${service} readiness timed out`)
}

const runCommand = async (
  command: string[],
  cwd: string,
  environment: Record<string, string>,
  failureMessage: string,
  captureOutput = false
) => {
  const child = Bun.spawn(command, {
    cwd,
    env: environment,
    stdin: "ignore",
    stdout: captureOutput ? "pipe" : "ignore",
    stderr: "ignore",
  })
  const output = captureOutput
    ? new Response(child.stdout).text()
    : Promise.resolve("")
  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(failureMessage)
  }
  return output
}

const writePrivateFile = async (path: string, contents: string) => {
  await writeFile(path, contents, { encoding: "utf8", mode: 0o600 })
  await chmod(path, 0o600)
}

export const startAgentEvalStack = async ({
  availableTools,
  namespace,
  openRouterApiKey,
  signal,
}: {
  availableTools: readonly string[]
  namespace: string
  openRouterApiKey: string
  signal: AbortSignal
}): Promise<AgentEvalStack> => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "enterprise-agent-eval-"))
  await chmod(temporaryRoot, 0o700)
  const [apiPort, databasePort, agentDatabasePort] = await Promise.all([
    reservePort(),
    reservePort(),
    reservePort(),
  ])
  const apiOrigin = `http://127.0.0.1:${apiPort}`
  const databaseOrigin = `http://127.0.0.1:${databasePort}`
  const agentDatabaseOrigin = `http://127.0.0.1:${agentDatabasePort}`
  const databasePath = resolve(temporaryRoot, "eval.db")
  const agentDatabasePath = resolve(temporaryRoot, "agent.db")
  if (
    databaseOrigin === agentDatabaseOrigin ||
    databasePath === agentDatabasePath ||
    APPLICATION_DATABASE_AUTH_TOKEN === AGENT_STORAGE_AUTH_TOKEN
  ) {
    throw new Error(
      "Agent eval requires isolated Application and Agent storage"
    )
  }
  const databaseEnvironment = {
    ...inheritedEnvironment,
    AGENT_EVAL_NAMESPACE: namespace,
    NODE_ENV: "test",
    TURSO_AUTH_TOKEN: APPLICATION_DATABASE_AUTH_TOKEN,
    TURSO_DATABASE_URL: databaseOrigin,
  }
  let databaseProcess: ManagedProcess | undefined
  let agentDatabaseProcess: ManagedProcess | undefined
  let wranglerProcess: ManagedProcess | undefined

  const onAbort = () => {
    if (wranglerProcess?.exitCode === null) wranglerProcess.kill("SIGTERM")
    if (databaseProcess?.exitCode === null) databaseProcess.kill("SIGTERM")
    if (agentDatabaseProcess?.exitCode === null) {
      agentDatabaseProcess.kill("SIGTERM")
    }
  }
  const close = async () => {
    signal.removeEventListener("abort", onAbort)
    await Promise.allSettled([
      stopProcess(wranglerProcess),
      stopProcess(databaseProcess),
      stopProcess(agentDatabaseProcess),
    ])
    await rm(temporaryRoot, { force: true, recursive: true })
  }
  signal.addEventListener("abort", onAbort, { once: true })
  if (signal.aborted) onAbort()

  try {
    databaseProcess = Bun.spawn(
      [
        "turso",
        "dev",
        "--db-file",
        databasePath,
        "--port",
        String(databasePort),
      ],
      {
        cwd: temporaryRoot,
        env: inheritedEnvironment,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      }
    )
    agentDatabaseProcess = Bun.spawn(
      [
        "turso",
        "dev",
        "--db-file",
        agentDatabasePath,
        "--port",
        String(agentDatabasePort),
      ],
      {
        cwd: temporaryRoot,
        env: inheritedEnvironment,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      }
    )
    await Promise.all([
      waitForHttp(
        `${databaseOrigin}/health`,
        30_000,
        "database",
        databaseProcess
      ),
      waitForHttp(
        `${agentDatabaseOrigin}/health`,
        30_000,
        "database",
        agentDatabaseProcess
      ),
    ])
    await runCommand(
      ["bun", "--no-env-file", "run", "db:migrate"],
      databaseWorkspace,
      databaseEnvironment,
      "Agent eval database migration failed"
    )
    const identityOutput = await runCommand(
      ["bun", "--no-env-file", "run", fixtureScript, "seed"],
      repositoryRoot,
      databaseEnvironment,
      "Agent eval fixture seed failed",
      true
    )
    const identity = fixtureIdentitySchema.parse(
      JSON.parse(await identityOutput)
    )
    await seedAndVerifySentinelMemory({
      agentDatabaseOrigin,
      agentStorageAuthToken: AGENT_STORAGE_AUTH_TOKEN,
      identity,
      namespace,
    })
    const names = {
      agentName: `enterprise-agent-eval-${namespace.slice(-32)}`,
      apiName: `enterprise-api-eval-${namespace.slice(-32)}`,
    }
    const configs = createAgentEvalConfigs({
      ...names,
      availableTools,
      apiOrigin,
      agentDatabaseOrigin,
      databaseOrigin,
      namespace,
    })
    const apiDirectory = resolve(temporaryRoot, "api")
    const agentDirectory = resolve(temporaryRoot, "agent")
    await Promise.all([
      mkdir(apiDirectory, { mode: 0o700 }),
      mkdir(agentDirectory, { mode: 0o700 }),
    ])
    const apiConfigPath = resolve(apiDirectory, "wrangler.json")
    const agentConfigPath = resolve(agentDirectory, "wrangler.json")
    const agentDevVarsPath = resolve(agentDirectory, ".dev.vars")
    await Promise.all([
      writePrivateFile(apiConfigPath, `${JSON.stringify(configs.api)}\n`),
      writePrivateFile(agentConfigPath, `${JSON.stringify(configs.agent)}\n`),
      writePrivateFile(
        agentDevVarsPath,
        `OPENROUTER_API_KEY=${JSON.stringify(openRouterApiKey)}\n`
      ),
    ])
    wranglerProcess = Bun.spawn(
      [
        wranglerBinary,
        "dev",
        "--local",
        "--config",
        apiConfigPath,
        "--config",
        agentConfigPath,
        "--persist-to",
        resolve(temporaryRoot, "wrangler-state"),
        "--ip",
        "127.0.0.1",
        "--port",
        String(apiPort),
        "--show-interactive-dev-session=false",
        "--log-level",
        "warn",
      ],
      {
        cwd: repositoryRoot,
        env: {
          ...inheritedEnvironment,
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
          WRANGLER_SEND_METRICS: "false",
        },
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      }
    )
    await waitForHttp(`${apiOrigin}/ready`, 180_000, "worker", wranglerProcess)
    await verifySentinelThroughPublicHistory({ apiOrigin, identity })
    return { apiOrigin, close, databaseEnvironment, identity }
  } catch (cause) {
    await close()
    throw cause
  }
}

export const readAgentEvalStackUsage = async (
  stack: AgentEvalStack
): Promise<AgentEvalStackUsageSnapshot> => {
  const output = await runCommand(
    ["bun", "--no-env-file", "run", fixtureScript, "usage"],
    repositoryRoot,
    stack.databaseEnvironment,
    "Agent eval usage snapshot failed",
    true
  )
  return usageSnapshotSchema.parse(JSON.parse(await output))
}

export const runAgentEvalStackScopeProbes = async (
  stack: AgentEvalStack
): Promise<z.infer<typeof scopeProbeSchema>> => {
  const output = await runCommand(
    ["bun", "--no-env-file", "run", scopeProbeScript],
    repositoryRoot,
    stack.databaseEnvironment,
    "Agent eval scope probe failed",
    true
  )
  const result = scopeProbeResultSchema.parse(JSON.parse(await output))
  if ("failureStage" in result) {
    throw new Error(`Agent eval scope probe ${result.failureStage} failed`)
  }
  return result
}
