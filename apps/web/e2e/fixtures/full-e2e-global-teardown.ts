import { rm } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"

import type { FullConfig } from "@playwright/test"

import {
  createAgentE2EEnvironment,
  removeAgentE2EArtifacts,
} from "./agent-e2e-environment"

export const removeFullE2EArtifacts = async (
  runId: number,
  webWorkspaceInput: string
) => {
  const environment = createAgentE2EEnvironment(runId)
  const webWorkspace = resolve(webWorkspaceInput)
  const nextDistPath = resolve(webWorkspace, environment.nextDistDirectory)
  if (
    dirname(nextDistPath) !== webWorkspace ||
    basename(nextDistPath) !== environment.nextDistDirectory ||
    !/^\.next-e2e-full-[1-9][0-9]*$/u.test(environment.nextDistDirectory)
  ) {
    throw new Error("Full E2E Next path is outside its workspace boundary")
  }
  await Promise.all([
    removeAgentE2EArtifacts(runId),
    rm(nextDistPath, { force: true, recursive: true }),
  ])
}

export default async function teardown(config: FullConfig) {
  const runId = config.metadata.agentE2ERunId
  const webWorkspace = config.metadata.agentE2EWebWorkspace
  if (typeof runId !== "number") {
    throw new Error("Full E2E run metadata is missing")
  }
  if (typeof webWorkspace !== "string") {
    throw new Error("Full E2E Web workspace metadata is missing")
  }
  await removeFullE2EArtifacts(runId, webWorkspace)
}
