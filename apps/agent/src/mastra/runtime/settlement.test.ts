import { describe, expect, it } from "vitest"

import type { AgentControlPlanePort as AgentInternalGateway } from "./ports"
import { createRunSettlement } from "./settlement"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"

type SettlementApi = Pick<AgentInternalGateway, "cancelRun" | "finishRun">

const harness = (fail = false) => {
  const calls: string[] = []
  const api: SettlementApi = {
    cancelRun: ({ grant }) => {
      calls.push(`cancel:${grant}`)
      if (fail) return Promise.reject(new Error(`private ${grant}`))
      return Promise.resolve({ runId: "run_1", status: "canceled" })
    },
    finishRun: ({ grant, outcome }) => {
      calls.push(`${outcome}:${grant}`)
      if (fail) return Promise.reject(new Error(`private ${grant}`))
      return Promise.resolve({
        runId: "run_1",
        status: outcome === "completed" ? "completed" : "failed",
      })
    },
  }
  return { api, calls }
}

describe("createRunSettlement", () => {
  it.each([
    ["complete", "completed"],
    ["fail", "failed"],
    ["cancel", "cancel"],
  ] as const)("settles %s once", async (method, expected) => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    await settlement[method]()
    await settlement[method]()

    expect(test.calls).toEqual([`${expected}:${RUN_GRANT}`])
  })

  it("swallows internal API details so grant and provider errors cannot escape", async () => {
    const test = harness(true)
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    await expect(settlement.fail()).resolves.toBeUndefined()
    await expect(settlement.cancel()).resolves.toBeUndefined()
    expect(test.calls).toEqual([`failed:${RUN_GRANT}`])
  })

  it("does not settle a run after a write action enters approval waiting", async () => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    settlement.holdForApproval()
    await settlement.complete()
    await settlement.fail()
    await settlement.cancel()

    expect(test.calls).toEqual([])
  })

  it("cannot be moved into approval waiting after it has settled", async () => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)
    await settlement.complete()
    settlement.holdForApproval()
    await settlement.fail()
    expect(test.calls).toEqual([`completed:${RUN_GRANT}`])
  })
})
