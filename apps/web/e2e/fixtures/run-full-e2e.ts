import { resolve } from "node:path"

import {
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "./agent-e2e-environment"
import { removeFullE2EArtifacts } from "./full-e2e-cleanup"

type FullE2ECommandOptions = {
  runId: number
  runPlaywright: (runId: number) => Promise<number>
  webWorkspace: string
}

const playwrightEnvironmentNames = [
  "PATH",
  "HOME",
  "TMPDIR",
  "USER",
  "SHELL",
  "LANG",
  "LC_ALL",
  "CI",
  "TERM",
  "OPENROUTER_API_KEY",
  "PAID_E2E_APPROVED",
  "AGENT_E2E_OBSERVABILITY",
] as const

export const createFullE2EPlaywrightEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
  runId: number
): Record<string, string> => ({
  ...Object.fromEntries(
    playwrightEnvironmentNames.flatMap((name) => {
      const value = environment[name]
      return value === undefined ? [] : [[name, value]]
    })
  ),
  AGENT_E2E_RUN_ID: String(runId),
  WEB_PLAYWRIGHT_PROFILE: "full",
})

export const selectFullE2EPlaywrightArguments = (
  arguments_: readonly string[]
): string[] => {
  if (arguments_.length === 0) return []
  if (arguments_.length === 1 && arguments_[0] === "--list") {
    return ["--list"]
  }
  throw new Error("Full E2E accepts only the optional --list argument")
}

export const runFullE2ECommand = async ({
  runId,
  runPlaywright,
  webWorkspace,
}: FullE2ECommandOptions): Promise<number> => {
  try {
    return await runPlaywright(runId)
  } finally {
    await removeFullE2EArtifacts(runId, webWorkspace)
  }
}

const runPlaywright = async (
  runId: number,
  arguments_: readonly string[]
): Promise<number> => {
  const child = Bun.spawn(
    [
      "node",
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.config.ts",
      ...arguments_,
    ],
    {
      cwd: process.cwd(),
      env: createFullE2EPlaywrightEnvironment(process.env, runId),
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }
  )
  const stop = () => {
    if (!child.killed) child.kill("SIGTERM")
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    return await child.exited
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
  }
}

if (import.meta.main) {
  const runId = parseAgentE2ERunId(process.env.AGENT_E2E_RUN_ID ?? process.pid)
  const environment = createAgentE2EEnvironment(runId)
  process.env.AGENT_E2E_RUN_ID = String(environment.runId)
  process.exitCode = await runFullE2ECommand({
    runId: environment.runId,
    runPlaywright: (currentRunId) =>
      runPlaywright(
        currentRunId,
        selectFullE2EPlaywrightArguments(process.argv.slice(2))
      ),
    webWorkspace: resolve(process.cwd()),
  })
}
