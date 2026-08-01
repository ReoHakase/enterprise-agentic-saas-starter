import { rm, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"

const TEMPORARY_DIRECTORY = resolve(tmpdir())
const RUN_DIRECTORY_PATTERN = /^enterprise-agentic-saas-agent-e2e-[1-9][0-9]*$/
const REMOVE_OPTIONS = {
  force: true,
  maxRetries: 5,
  recursive: true,
  retryDelay: 50,
} as const

export type AgentE2EEnvironment = ReturnType<typeof createAgentE2EEnvironment>

export const agentE2EWorkerEntrypoint = (scriptedAgent: boolean): string =>
  scriptedAgent ? "src/mastra/e2e/worker.ts" : "src/mastra/worker.ts"

export const parseAgentE2ERunId = (value: string | number): number => {
  const runId = typeof value === "number" ? value : Number(value)
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new Error("Agent E2E requires a positive run identifier")
  }
  return runId
}

const validateTemporaryRoot = (path: string): string => {
  const resolvedPath = resolve(path)
  if (
    dirname(resolvedPath) !== TEMPORARY_DIRECTORY ||
    !RUN_DIRECTORY_PATTERN.test(basename(resolvedPath))
  ) {
    throw new Error("Agent E2E path is outside its temporary boundary")
  }
  return resolvedPath
}

export const createAgentE2EEnvironment = (input: string | number) => {
  const runId = parseAgentE2ERunId(input)
  const portBase = 24_000 + (runId % 1_600) * 5
  const webPort = portBase
  const apiPort = portBase + 1
  const githubPort = portBase + 2
  const applicationDatabasePort = portBase + 3
  const agentStoragePort = portBase + 4
  const cookieDomain = "agent-e2e.enterprise-agentic-saas.localhost"
  const temporaryRoot = validateTemporaryRoot(
    join(TEMPORARY_DIRECTORY, `enterprise-agentic-saas-agent-e2e-${runId}`)
  )
  const stackRoot = join(temporaryRoot, "stack")

  return {
    runId,
    telemetrySessionId: `agent-e2e-${runId}`,
    telemetryWorktreeId: "agent-e2e",
    webPort,
    apiPort,
    githubPort,
    applicationDatabasePort,
    agentStoragePort,
    webOrigin: `http://${cookieDomain}:${webPort}`,
    apiOrigin: `http://api.${cookieDomain}:${apiPort}`,
    apiLoopbackOrigin: `http://127.0.0.1:${apiPort}`,
    githubOrigin: `http://127.0.0.1:${githubPort}`,
    applicationDatabaseOrigin: `http://127.0.0.1:${applicationDatabasePort}`,
    agentStorageOrigin: `http://127.0.0.1:${agentStoragePort}`,
    applicationDatabaseAuthToken: "application-e2e-unused-token",
    agentStorageAuthToken: "agent-storage-e2e-unused-token",
    cookieDomain,
    temporaryRoot,
    stackRoot,
    nextDistDirectory: `.next-e2e-full-${runId}`,
    applicationDatabasePath: join(stackRoot, "application.db"),
    agentStoragePath: join(stackRoot, "agent-storage.db"),
    wranglerStatePath: join(stackRoot, "wrangler-state"),
    apiConfigPath: join(stackRoot, "api", "wrangler.json"),
    agentConfigPath: join(stackRoot, "agent", "wrangler.json"),
    agentDevVarsPath: join(stackRoot, "agent", ".dev.vars"),
    apiWorkerName: `enterprise-agentic-saas-api-agent-e2e-${runId}`,
    agentWorkerName: `enterprise-agentic-saas-agent-e2e-${runId}`,
  }
}

export const createAgentE2ETelemetryVariables = (
  environment: AgentE2EEnvironment,
  enabled: boolean
) =>
  enabled
    ? {
        AGENT_E2E_RUN_ID: String(environment.runId),
        DEV_SESSION_ID: environment.telemetrySessionId,
        DEV_WORKTREE_ID: environment.telemetryWorktreeId,
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      }
    : {}

export const removeAgentE2EArtifacts = async (
  input: string | number
): Promise<void> => {
  const { temporaryRoot } = createAgentE2EEnvironment(input)
  await rm(temporaryRoot, REMOVE_OPTIONS)
}

export const removeAgentE2EStackArtifacts = async (
  input: string | number
): Promise<void> => {
  const { stackRoot, temporaryRoot } = createAgentE2EEnvironment(input)
  await rm(stackRoot, REMOVE_OPTIONS)
  try {
    await rmdir(temporaryRoot)
  } catch (cause) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      (cause.code === "ENOENT" || cause.code === "ENOTEMPTY")
    ) {
      return
    }
    throw cause
  }
}
