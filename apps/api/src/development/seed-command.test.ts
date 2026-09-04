import { describe, expect, it, vi } from "vitest"

import {
  DevelopmentLockBusyError,
  type DevelopmentLease,
} from "./development-lock"
import {
  runDevelopmentSeedCommand,
  type DevelopmentSeedCommandServices,
} from "./seed-command"
import type { DevelopmentSeedSession } from "./session"

const session = {
  endpoint: "http://127.0.0.1:8787",
  mode: "local",
  token: "x".repeat(64),
} satisfies DevelopmentSeedSession

const createServices = (
  overrides: Partial<DevelopmentSeedCommandServices> = {}
) => {
  const events: string[] = []
  const lease = (name: string): DevelopmentLease => ({
    release: async () => {
      events.push(`release:${name}`)
    },
  })
  const services = {
    assertSafeConfiguration: vi.fn<
      DevelopmentSeedCommandServices["assertSafeConfiguration"]
    >(() => events.push("assert")),
    acquireSeedLease: vi.fn<DevelopmentSeedCommandServices["acquireSeedLease"]>(
      async () => {
        events.push("acquire:seed")
        return lease("seed")
      }
    ),
    acquireWorkerLease: vi.fn<
      DevelopmentSeedCommandServices["acquireWorkerLease"]
    >(async () => {
      events.push("acquire:worker")
      return lease("worker")
    }),
    findActiveSession: vi.fn<
      DevelopmentSeedCommandServices["findActiveSession"]
    >(async () => undefined),
    clearStaleSession: vi.fn<
      DevelopmentSeedCommandServices["clearStaleSession"]
    >(async () => {
      events.push("clear-session")
    }),
    ensureDatabaseRunning: vi.fn<
      DevelopmentSeedCommandServices["ensureDatabaseRunning"]
    >(async () => undefined),
    prepareDatabase: vi.fn<DevelopmentSeedCommandServices["prepareDatabase"]>(
      async () => {
        events.push("prepare-db")
      }
    ),
    seedDatabase: vi.fn<DevelopmentSeedCommandServices["seedDatabase"]>(
      async () => {
        events.push("seed-db")
      }
    ),
    startWorker: vi.fn<DevelopmentSeedCommandServices["startWorker"]>(
      async () => ({
        session,
        service: {
          stop: async () => {
            events.push("stop:worker")
          },
        },
      })
    ),
    reconcile: vi.fn<DevelopmentSeedCommandServices["reconcile"]>(async () => {
      events.push("reconcile")
      return 7
    }),
    report: vi.fn<DevelopmentSeedCommandServices["report"]>(),
    ...overrides,
  } satisfies DevelopmentSeedCommandServices
  return { events, services }
}

describe("development DBとR2のseed command", () => {
  it("正常なWorkerをdev serviceの起動停止なしで再利用する", async () => {
    const { events, services } = createServices({
      findActiveSession: vi.fn<
        DevelopmentSeedCommandServices["findActiveSession"]
      >(async () => session),
    })

    await expect(runDevelopmentSeedCommand({ services })).resolves.toEqual({
      fixtureCount: 7,
      reusedWorker: true,
    })
    expect(services.acquireWorkerLease).not.toHaveBeenCalled()
    expect(services.ensureDatabaseRunning).not.toHaveBeenCalled()
    expect(services.startWorker).not.toHaveBeenCalled()
    expect(events).toEqual([
      "assert",
      "acquire:seed",
      "seed-db",
      "reconcile",
      "release:seed",
    ])
  })

  it("不足serviceを一時起動して所有processだけを停止する", async () => {
    const { events, services } = createServices({
      ensureDatabaseRunning: vi.fn<
        DevelopmentSeedCommandServices["ensureDatabaseRunning"]
      >(async () => {
        events.push("start:database")
        return {
          stop: async () => {
            events.push("stop:database")
          },
        }
      }),
      startWorker: vi.fn<DevelopmentSeedCommandServices["startWorker"]>(
        async () => {
          events.push("start:worker")
          return {
            session,
            service: {
              stop: async () => {
                events.push("stop:worker")
              },
            },
          }
        }
      ),
    })

    await expect(runDevelopmentSeedCommand({ services })).resolves.toEqual({
      fixtureCount: 7,
      reusedWorker: false,
    })
    expect(events).toEqual([
      "assert",
      "acquire:seed",
      "acquire:worker",
      "clear-session",
      "start:database",
      "prepare-db",
      "seed-db",
      "start:worker",
      "reconcile",
      "stop:worker",
      "stop:database",
      "release:worker",
      "release:seed",
    ])
  })

  it("起動済みlocal databaseを稼働させたままにする", async () => {
    const { events, services } = createServices()

    await expect(
      runDevelopmentSeedCommand({ services })
    ).resolves.toMatchObject({ reusedWorker: false })
    expect(services.ensureDatabaseRunning).toHaveBeenCalledOnce()
    expect(events).not.toContain("stop:database")
    expect(events.slice(-3)).toEqual([
      "stop:worker",
      "release:worker",
      "release:seed",
    ])
  })

  it("同時起動中の通常dev Workerを待つ", async () => {
    const findActiveSession =
      vi.fn<DevelopmentSeedCommandServices["findActiveSession"]>()
    findActiveSession.mockResolvedValueOnce(undefined)
    findActiveSession.mockResolvedValueOnce(session)
    const { services } = createServices({
      acquireWorkerLease: vi.fn<
        DevelopmentSeedCommandServices["acquireWorkerLease"]
      >(async () => {
        throw new DevelopmentLockBusyError("Local API Worker")
      }),
      findActiveSession,
    })

    await expect(
      runDevelopmentSeedCommand({ services })
    ).resolves.toMatchObject({ reusedWorker: true })
    expect(findActiveSession).toHaveBeenCalledTimes(2)
    expect(services.startWorker).not.toHaveBeenCalled()
  })

  it("reconcile失敗後に所有serviceをすべて片付ける", async () => {
    const { events, services } = createServices({
      ensureDatabaseRunning: vi.fn<
        DevelopmentSeedCommandServices["ensureDatabaseRunning"]
      >(async () => ({
        stop: async () => {
          events.push("stop:database")
        },
      })),
      reconcile: vi.fn<DevelopmentSeedCommandServices["reconcile"]>(
        async () => {
          throw new Error("reconcile failed")
        }
      ),
    })

    await expect(runDevelopmentSeedCommand({ services })).rejects.toThrow(
      "reconcile failed"
    )
    expect(events.slice(-4)).toEqual([
      "stop:worker",
      "stop:database",
      "release:worker",
      "release:seed",
    ])
  })

  it("lease取得前に安全でない設定を拒否する", async () => {
    const { services } = createServices({
      assertSafeConfiguration: vi.fn<
        DevelopmentSeedCommandServices["assertSafeConfiguration"]
      >(() => {
        throw new Error("remote database")
      }),
    })

    await expect(runDevelopmentSeedCommand({ services })).rejects.toThrow(
      "remote database"
    )
    expect(services.acquireSeedLease).not.toHaveBeenCalled()
  })
})
