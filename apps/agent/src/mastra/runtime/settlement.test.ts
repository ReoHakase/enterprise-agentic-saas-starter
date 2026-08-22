import { describe, expect, it, vi } from "vitest"

import type { AgentControlPlanePort as AgentInternalGateway } from "./ports"
import { createRunSettlement } from "./settlement"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"

type SettlementApi = Pick<AgentInternalGateway, "finalizeRun">

const harness = (failure: false | Error = false) => {
  const calls: string[] = []
  const api: SettlementApi = {
    finalizeRun: ({ grant, outcome }) => {
      calls.push(`${outcome}:${grant}`)
      if (failure) return Promise.reject(failure)
      return Promise.resolve({ runId: "run_1", status: outcome })
    },
  }
  return { api, calls }
}

describe("createRunSettlement", () => {
  it.each([
    ["complete", "completed"],
    ["fail", "failed"],
    ["cancel", "canceled"],
  ] as const)("settles %s once", async (method, expected) => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    const first = await settlement[method]()
    await settlement[method]()

    expect(test.calls).toEqual([`${expected}:${RUN_GRANT}`])
    expect(first).toBe(method === "complete" ? "completed" : undefined)
  })

  it("swallows internal API details so grant and provider errors cannot escape", async () => {
    const cause = new Error(`private ${RUN_GRANT}`)
    const test = harness(cause)
    const reportFailure = vi.fn<(cause: unknown) => void>()
    const settlement = createRunSettlement(test.api, RUN_GRANT, reportFailure)

    await expect(settlement.fail()).resolves.toBeUndefined()
    await expect(settlement.cancel()).resolves.toBeUndefined()
    expect(test.calls).toEqual([`failed:${RUN_GRANT}`])
    expect(reportFailure).toHaveBeenCalledOnce()
    expect(reportFailure).toHaveBeenCalledWith(cause)
  })

  it("does not let failure reporting replace settlement failure handling", async () => {
    const test = harness(new Error("settlement failed"))
    const settlement = createRunSettlement(test.api, RUN_GRANT, () => {
      throw new Error("reporting failed")
    })

    await expect(settlement.fail()).resolves.toBeUndefined()
    expect(test.calls).toEqual([`failed:${RUN_GRANT}`])
  })

  it("records final usage while preserving approval waiting", async () => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    settlement.holdForApproval()
    await expect(settlement.complete()).resolves.toBeNull()
    await settlement.fail()
    await settlement.cancel()

    expect(test.calls).toEqual([`waiting_approval:${RUN_GRANT}`])
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
