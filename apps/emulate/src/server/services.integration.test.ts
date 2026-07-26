import type { Emulator } from "emulate"
import { expect, it } from "vitest"

import type { EmulateConfig } from "../config/index"
import { GITHUB_OAUTH_CALLBACK_PATH } from "../protocol/github-oauth"
import {
  getEmulateServiceDefinition,
  type EmulateService,
} from "../services/registry"
import { reserveLoopbackPort } from "../test-support/reserve-port"
import { startEmulator } from "./emulator"

const SERVICES = [
  "github",
  "google",
  "slack",
  "apple",
  "microsoft",
  "okta",
  "stripe",
] as const satisfies readonly EmulateService[]

const createConfig = (service: EmulateService, port: number): EmulateConfig => {
  const baseUrl = `http://localhost:${port}`

  if (service === "github") {
    return {
      service,
      port,
      baseUrl,
      callbackUrl: `http://localhost:3001${GITHUB_OAUTH_CALLBACK_PATH}`,
      clientId: "integration-client-id",
      clientSecret: "integration-client-secret",
    }
  }

  return { service, port, baseUrl }
}

it.each(SERVICES)(
  "%s serviceを実HTTP listenerで起動できる",
  async (service) => {
    const port = await reserveLoopbackPort()
    const config = createConfig(service, port)
    let emulator: Emulator | undefined

    try {
      emulator = await startEmulator(config)
      const { readinessPath } = getEmulateServiceDefinition(service)
      const response = await fetch(new URL(readinessPath, emulator.url))

      expect(response.status).toBe(200)
    } finally {
      await emulator?.close()
    }
  }
)
