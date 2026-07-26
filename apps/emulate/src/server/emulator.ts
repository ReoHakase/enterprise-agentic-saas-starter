import type { Emulator, EmulatorOptions } from "emulate"

import { createEmulator } from "../adapters/emulate"
import type { EmulateConfig } from "../config/index"
import { createGitHubOAuthSeed } from "../fixtures/github"
import { getEmulateServiceDefinition } from "../services/registry"

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
  waitUntilReady?: (config: EmulateConfig) => Promise<void>
}

class EmulateReadinessError extends Error {
  constructor(service: EmulateConfig["service"]) {
    super(`${service} emulatorのreadiness確認がtimeoutしました。`)
    this.name = "EmulateReadinessError"
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })

const waitForEmulatorReady = async (
  config: EmulateConfig,
  options: ReadinessOptions = {}
) => {
  const attempts = options.attempts ?? 40
  const fetchReadiness = options.fetch ?? fetch
  const intervalMs = options.intervalMs ?? 25
  const { readinessPath } = getEmulateServiceDefinition(config.service)
  const readinessUrl = `http://127.0.0.1:${config.port}${readinessPath}`

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
      throw new EmulateReadinessError(config.service)
    }

    await delay(intervalMs)
    return poll(attempt + 1)
  }

  return poll(1)
}

const createEmulatorOptions = (config: EmulateConfig): EmulatorOptions => {
  if (config.service === "github") {
    return {
      service: config.service,
      port: config.port,
      baseUrl: config.baseUrl,
      seed: createGitHubOAuthSeed(config),
    }
  }

  return {
    service: config.service,
    port: config.port,
    baseUrl: config.baseUrl,
  }
}

export const startEmulator = (
  config: EmulateConfig,
  dependencies: StartDependencies = {}
) => {
  const create = dependencies.create ?? createEmulator
  const waitUntilReady = dependencies.waitUntilReady ?? waitForEmulatorReady

  return create(createEmulatorOptions(config)).then(async (emulator) => {
    try {
      await waitUntilReady(config)
      return emulator
    } catch (error) {
      await emulator.close().catch(() => undefined)
      throw error
    }
  })
}
