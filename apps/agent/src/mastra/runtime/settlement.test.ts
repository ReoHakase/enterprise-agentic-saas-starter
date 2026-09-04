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

describe("createRunSettlementの契約", () => {
  it.each([
    ["complete", "completed"],
    ["fail", "failed"],
    ["cancel", "canceled"],
  ] as const)("実行結果%#を一度だけsettleする", async (method, expected) => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    const first = await settlement[method]()
    await settlement[method]()

    expect(test.calls).toEqual([`${expected}:${RUN_GRANT}`])
    expect(first).toBe(method === "complete" ? "completed" : undefined)
  })

  it("grantとprovider errorを漏らさないよう内部API詳細を隠す", async () => {
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

  it("失敗報告にsettlement失敗処理を置換させない", async () => {
    const test = harness(new Error("settlement failed"))
    const settlement = createRunSettlement(test.api, RUN_GRANT, () => {
      throw new Error("reporting failed")
    })

    await expect(settlement.fail()).resolves.toBeUndefined()
    expect(test.calls).toEqual([`failed:${RUN_GRANT}`])
  })

  it("approval待ちを保ちながら最終usageを記録する", async () => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)

    settlement.holdForApproval()
    await expect(settlement.complete()).resolves.toBeNull()
    await settlement.fail()
    await settlement.cancel()

    expect(test.calls).toEqual([`waiting_approval:${RUN_GRANT}`])
  })

  it("settle後はapproval待ちへ移行できない", async () => {
    const test = harness()
    const settlement = createRunSettlement(test.api, RUN_GRANT)
    await settlement.complete()
    settlement.holdForApproval()
    await settlement.fail()
    expect(test.calls).toEqual([`completed:${RUN_GRANT}`])
  })
})
