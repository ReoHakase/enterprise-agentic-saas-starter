import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"

const TEMPORARY_DIRECTORY = resolve(tmpdir())
const RUN_DIRECTORY_PATTERN = /^enterprise-agentic-saas-agent-e2e-[1-9][0-9]*$/

export type AgentE2EEnvironment = ReturnType<typeof createAgentE2EEnvironment>

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
  const portBase = 24_000 + (runId % 2_000) * 4
  const webPort = portBase
  const apiPort = portBase + 1
  const githubPort = portBase + 2
  const databasePort = portBase + 3
  const cookieDomain = "agent-e2e.enterprise-agentic-saas.localhost"
  const temporaryRoot = validateTemporaryRoot(
    join(TEMPORARY_DIRECTORY, `enterprise-agentic-saas-agent-e2e-${runId}`)
  )

  return {
    runId,
    webPort,
    apiPort,
    githubPort,
    databasePort,
    webOrigin: `http://${cookieDomain}:${webPort}`,
    apiOrigin: `http://api.${cookieDomain}:${apiPort}`,
    githubOrigin: `http://github.${cookieDomain}:${githubPort}`,
    databaseOrigin: `http://127.0.0.1:${databasePort}`,
    cookieDomain,
    temporaryRoot,
    databasePath: join(temporaryRoot, "agent-e2e.db"),
    wranglerStatePath: join(temporaryRoot, "wrangler-state"),
    apiConfigPath: join(temporaryRoot, "api", "wrangler.json"),
    agentConfigPath: join(temporaryRoot, "agent", "wrangler.json"),
    agentDevVarsPath: join(temporaryRoot, "agent", ".dev.vars"),
    apiWorkerName: `enterprise-agentic-saas-api-agent-e2e-${runId}`,
    agentWorkerName: `enterprise-agentic-saas-agent-e2e-${runId}`,
  }
}

export const removeAgentE2EArtifacts = async (
  input: string | number
): Promise<void> => {
  const { temporaryRoot } = createAgentE2EEnvironment(input)
  await rm(temporaryRoot, { force: true, recursive: true })
}
