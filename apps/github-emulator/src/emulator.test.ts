import type { Emulator, EmulatorOptions } from "emulate"
import { describe, expect, it } from "vitest"

import type { GitHubEmulatorConfig } from "./config"
import {
  createGracefulShutdown,
  type CreateEmulator,
  GitHubEmulatorReadinessError,
  startGitHubEmulator,
  waitForGitHubEmulatorReady,
} from "./emulator"

const CONFIG: GitHubEmulatorConfig = {
  port: 4001,
  baseUrl: "http://localhost:4001",
  callbackUrl: "http://localhost:3001/auth/oauth2/callback/github",
  clientId: "local-client-id",
  clientSecret: "local-client-secret",
}

const createFakeEmulator = (close: () => Promise<void>): Emulator => ({
  url: CONFIG.baseUrl,
  reset: () => undefined,
  close,
})

describe("startGitHubEmulator", () => {
  it("programmatic APIへGitHub serviceとstrict seedを渡す", async () => {
    const calls: EmulatorOptions[] = []
    const expected = createFakeEmulator(async () => undefined)
    const create: CreateEmulator = async (options) => {
      calls.push(options)
      return expected
    }

    await expect(
      startGitHubEmulator(CONFIG, {
        create,
        waitUntilReady: async () => undefined,
      })
    ).resolves.toBe(expected)
    expect(calls).toEqual([
      expect.objectContaining({
        service: "github",
        port: CONFIG.port,
        baseUrl: CONFIG.baseUrl,
        seed: expect.objectContaining({
          github: expect.objectContaining({
            oauth_apps: expect.arrayContaining([
              expect.objectContaining({ client_id: CONFIG.clientId }),
            ]),
          }),
        }),
      }),
    ])
  })

  it("readiness失敗時にlistenerをcloseする", async () => {
    const calls: string[] = []
    const create: CreateEmulator = async () =>
      createFakeEmulator(async () => {
        calls.push("close")
      })

    await expect(
      startGitHubEmulator(CONFIG, {
        create,
        waitUntilReady: async () => {
          throw new GitHubEmulatorReadinessError()
        },
      })
    ).rejects.toBeInstanceOf(GitHubEmulatorReadinessError)
    expect(calls).toEqual(["close"])
  })
})

describe("waitForGitHubEmulatorReady", () => {
  it("/metaが成功するまでbounded retryする", async () => {
    let calls = 0

    await expect(
      waitForGitHubEmulatorReady(4001, {
        attempts: 3,
        intervalMs: 0,
        fetch: async () => {
          calls += 1
          return new Response(null, { status: calls === 2 ? 200 : 503 })
        },
      })
    ).resolves.toBeUndefined()
    expect(calls).toBe(2)
  })

  it("retry上限を超えたらstable errorにする", async () => {
    await expect(
      waitForGitHubEmulatorReady(4001, {
        attempts: 2,
        intervalMs: 0,
        fetch: async () => {
          throw new Error("connection refused")
        },
      })
    ).rejects.toBeInstanceOf(GitHubEmulatorReadinessError)
  })
})

describe("createGracefulShutdown", () => {
  it("複数signalでもcloseとexitを一度だけ実行する", async () => {
    const calls: string[] = []
    const emulator = createFakeEmulator(async () => {
      calls.push("close")
    })
    const shutdown = createGracefulShutdown(emulator, (code) => {
      calls.push(`exit:${code}`)
    })

    await Promise.all([shutdown(), shutdown()])

    expect(calls).toEqual(["close", "exit:0"])
  })

  it("close失敗をexit code 1へ変換する", async () => {
    const exitCodes: number[] = []
    const emulator = createFakeEmulator(async () => {
      throw new Error("close failed")
    })
    const shutdown = createGracefulShutdown(emulator, (code) => {
      exitCodes.push(code)
    })

    await expect(shutdown()).resolves.toBeUndefined()
    expect(exitCodes).toEqual([1])
  })
})
