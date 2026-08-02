import type { FullConfig } from "@playwright/test"

import { removeAgentE2EArtifacts } from "./agent-e2e-environment"
import { removeOAuthDatabaseFiles } from "./oauth-database"

export default async function teardown(config: FullConfig) {
  const databasePath = config.metadata.oauthDatabasePath
  const agentRunId = config.metadata.agentE2ERunId
  const cleanupTasks: Array<Promise<void>> = []

  if (typeof databasePath === "string") {
    cleanupTasks.push(removeOAuthDatabaseFiles(databasePath))
  }
  if (typeof agentRunId === "number") {
    cleanupTasks.push(removeAgentE2EArtifacts(agentRunId))
  }
  if (cleanupTasks.length === 0) {
    throw new Error("Deterministic E2E cleanup metadata is missing")
  }

  await Promise.all(cleanupTasks)
}
