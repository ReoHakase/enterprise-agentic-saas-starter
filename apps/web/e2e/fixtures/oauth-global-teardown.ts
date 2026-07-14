import type { FullConfig } from "@playwright/test"

import { removeOAuthDatabaseFiles } from "./oauth-database"

export default async function teardown(config: FullConfig) {
  const databasePath = config.metadata.oauthDatabasePath

  if (typeof databasePath !== "string") {
    throw new Error("OAuth E2E database metadata is missing")
  }

  await removeOAuthDatabaseFiles(databasePath)
}
