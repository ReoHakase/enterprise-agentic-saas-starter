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

const QWEN_DIAGNOSTIC_TAG = "@diagnostic-qwen"

const combineGrepInvertArguments = (
  arguments_: readonly string[]
): string[] => {
  const forwardedArguments: string[] = []
  const invertedPatterns = [QWEN_DIAGNOSTIC_TAG]

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === undefined) {
      throw new Error("Playwright arguments must be defined")
    }
    if (argument === "--grep-invert") {
      const pattern = arguments_[index + 1]
      if (pattern === undefined || pattern.startsWith("--")) {
        throw new Error("--grep-invert requires a pattern")
      }
      invertedPatterns.push(pattern)
      index += 1
    } else if (argument.startsWith("--grep-invert=")) {
      const pattern = argument.slice("--grep-invert=".length)
      if (pattern.length === 0) {
        throw new Error("--grep-invert requires a pattern")
      }
      invertedPatterns.push(pattern)
    } else {
      forwardedArguments.push(argument)
    }
  }

  return [
    "--grep-invert",
    invertedPatterns.map((pattern) => `(?:${pattern})`).join("|"),
    ...forwardedArguments,
  ]
}

export const selectFullE2EPlaywrightArguments = (
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>>
): string[] =>
  environment.PAID_E2E_DIAGNOSTIC === "1"
    ? [...arguments_]
    : combineGrepInvertArguments(arguments_)

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
  const childEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "NO_COLOR")
  )
  childEnvironment.AGENT_E2E_RUN_ID = String(runId)
  const child = Bun.spawn(
    [
      "node",
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.full.config.ts",
      ...arguments_,
    ],
    {
      cwd: process.cwd(),
      env: childEnvironment,
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
        selectFullE2EPlaywrightArguments(process.argv.slice(2), process.env)
      ),
    webWorkspace: resolve(process.cwd()),
  })
}
