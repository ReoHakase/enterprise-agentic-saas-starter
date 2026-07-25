import type { Emulator, EmulatorOptions } from "emulate"

import { createGitHubEmulator } from "../adapters/emulate"
import type { GitHubEmulatorConfig } from "../config/index"
import { createGitHubOAuthSeed } from "../fixtures/github"

type CreateEmulator = (options: EmulatorOptions) => Promise<Emulator>

type ReadinessOptions = {
  attempts?: number
  fetch?: (
    input: string,
    init: RequestInit
  ) => Promise<{ readonly ok: boolean }>
  intervalMs?: number
}

type StartDependencies = {
  create?: CreateEmulator
  waitUntilReady?: (port: number) => Promise<void>
}

class GitHubEmulatorReadinessError extends Error {
  constructor() {
    super("GitHub OAuth emulatorのreadiness確認がtimeoutしました。")
    this.name = "GitHubEmulatorReadinessError"
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })

const waitForGitHubEmulatorReady = async (
  port: number,
  options: ReadinessOptions = {}
) => {
  const attempts = options.attempts ?? 40
  const fetchReadiness = options.fetch ?? fetch
  const intervalMs = options.intervalMs ?? 25
  const readinessUrl = `http://127.0.0.1:${port}/meta`

  const poll = async (attempt: number): Promise<void> => {
    try {
      const response = await fetchReadiness(readinessUrl, {
        signal: AbortSignal.timeout(250),
      })

      if (response.ok) {
        return
      }
    } catch {
      // createEmulatorはlisten完了を待たないため、接続拒否中はbounded retryする。
    }

    if (attempt >= attempts) {
      throw new GitHubEmulatorReadinessError()
    }

    await delay(intervalMs)
    return poll(attempt + 1)
  }

  return poll(1)
}

export const startGitHubEmulator = (
  config: GitHubEmulatorConfig,
  dependencies: StartDependencies = {}
) => {
  const create = dependencies.create ?? createGitHubEmulator
  const waitUntilReady =
    dependencies.waitUntilReady ?? waitForGitHubEmulatorReady

  return create({
    service: "github",
    port: config.port,
    baseUrl: config.baseUrl,
    seed: createGitHubOAuthSeed(config),
  }).then(async (emulator) => {
    try {
      await waitUntilReady(config.port)
      return emulator
    } catch (error) {
      await emulator.close().catch(() => undefined)
      throw error
    }
  })
}
