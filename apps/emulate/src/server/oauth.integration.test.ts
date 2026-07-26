import type { Emulator } from "emulate"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { GitHubEmulatorConfig } from "../config/index"
import { GITHUB_OAUTH_CALLBACK_PATH } from "../protocol/github-oauth"
import { reserveLoopbackPort } from "../test-support/reserve-port"
import { startEmulator } from "./emulator"

describe("GitHub OAuth emulator", () => {
  let emulator: Emulator | undefined
  let config: GitHubEmulatorConfig | undefined

  beforeAll(async () => {
    const port = await reserveLoopbackPort()
    config = {
      service: "github",
      port,
      baseUrl: `http://localhost:${port}`,
      callbackUrl: `http://localhost:3001${GITHUB_OAUTH_CALLBACK_PATH}`,
      clientId: "integration-client-id",
      clientSecret: "integration-client-secret",
    }
    emulator = await startEmulator(config)
  })

  afterAll(async () => {
    await emulator?.close()
  })

  it("登録済みclientだけにauthorization pageを返す", async () => {
    if (!emulator || !config) {
      throw new Error("emulatorが起動していません")
    }

    const acceptedUrl = new URL("/login/oauth/authorize", emulator.url)
    acceptedUrl.searchParams.set("client_id", config.clientId)
    acceptedUrl.searchParams.set("redirect_uri", config.callbackUrl)
    const accepted = await fetch(acceptedUrl)

    expect(accepted.status).toBe(200)
    await expect(accepted.text()).resolves.toContain("oauth-alice")

    const rejectedUrl = new URL(acceptedUrl)
    rejectedUrl.searchParams.set("client_id", "unregistered-client")
    const rejected = await fetch(rejectedUrl)

    expect(rejected.status).toBe(400)
  })
})
