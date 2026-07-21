import type { AgentInternalApiContract } from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it } from "vitest"

import { createRunSettlement } from "./run-settlement"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"

type SettlementApi = Pick<AgentInternalApiContract, "cancelRun" | "finishRun">

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

  it("swallows RPC details so grant and provider errors cannot escape", async () => {
    const test = harness(true)
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    await expect(settlement.fail()).resolves.toBeUndefined()
    await expect(settlement.cancel()).resolves.toBeUndefined()
    expect(test.calls).toEqual([`failed:${RUN_GRANT}`])
  })
})
