import { createServer } from "node:http"

import type { Emulator } from "emulate"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { GitHubEmulatorConfig } from "./config"
import { startGitHubEmulator } from "./emulator"

const CALLBACK_PATH = "/auth/oauth2/callback/github"

const reservePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()

      if (!address || typeof address === "string") {
        server.close()
        reject(new Error("available portを取得できませんでした"))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(address.port)
      })
    })
  })

describe("GitHub OAuth emulator", () => {
  let emulator: Emulator | undefined
  let config: GitHubEmulatorConfig | undefined

  beforeAll(async () => {
    const port = await reservePort()
    config = {
      port,
      baseUrl: `http://localhost:${port}`,
      callbackUrl: `http://localhost:3001${CALLBACK_PATH}`,
      clientId: "integration-client-id",
      clientSecret: "integration-client-secret",
    }
    emulator = await startGitHubEmulator(config)
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
