import {
  LOCAL_GITHUB_OAUTH_CLIENT_ID,
  LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
} from "@enterprise-agentic-saas/auth/github-oauth"

import {
  GitHubEmulatorEnvironmentError,
  parseGitHubEmulatorConfig,
} from "./config"
import { createGracefulShutdown, startGitHubEmulator } from "./emulator"

const main = async () => {
  const config = parseGitHubEmulatorConfig(process.env, {
    clientId: LOCAL_GITHUB_OAUTH_CLIENT_ID,
    clientSecret: LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
  })
  const emulator = await startGitHubEmulator(config)
  const shutdown = createGracefulShutdown(emulator, (code) =>
    process.exit(code)
  )

  process.once("SIGINT", () => void shutdown())
  process.once("SIGTERM", () => void shutdown())

  console.info(`GitHub OAuth emulator: ${emulator.url}`)
}

main().catch((error: unknown) => {
  if (error instanceof GitHubEmulatorEnvironmentError) {
    console.error(error.message)
  } else {
    console.error("GitHub OAuth emulatorを起動できませんでした。")
  }

  process.exitCode = 1
})
