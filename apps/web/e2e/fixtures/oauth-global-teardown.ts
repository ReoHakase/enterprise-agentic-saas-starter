import type { FullConfig } from "@playwright/test"

import { removeAgentE2EArtifacts } from "./agent-e2e-environment"
import { removeOAuthDatabaseFiles } from "./oauth-database"

export default async function teardown(config: FullConfig) {
  const databasePath = config.metadata.oauthDatabasePath
  const agentRunId = config.metadata.agentE2ERunId

  if (typeof databasePath !== "string") {
    throw new Error("OAuth E2E database metadata is missing")
  }
  if (typeof agentRunId !== "number") {
    throw new Error("Agent E2E run metadata is missing")
  }

  await Promise.all([
    removeOAuthDatabaseFiles(databasePath),
    removeAgentE2EArtifacts(agentRunId),
  ])
}
