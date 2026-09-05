import { rm } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"

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
  const webBuildRoot = resolve(webWorkspace, "dist")
  const webBuildPath = resolve(webWorkspace, environment.webBuildDirectory)
  if (
    dirname(webBuildPath) !== webBuildRoot ||
    !/^e2e-full-[1-9][0-9]*$/u.test(basename(webBuildPath)) ||
    environment.webBuildDirectory !== `dist/e2e-full-${runId}`
  ) {
    throw new Error("Full E2E Web build is outside its workspace boundary")
  }
  await Promise.all([
    removeAgentE2EArtifacts(runId),
    rm(webBuildPath, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 50,
    }),
  ])
}
