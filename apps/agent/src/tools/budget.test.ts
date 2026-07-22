import { describe, expect, it } from "vitest"

import { createAgentToolBudget } from "./budget"

describe("createAgentToolBudget", () => {
  it("shares the total call budget across read, write, and client tools", () => {
    const budget = createAgentToolBudget({ calls: 3, writes: 2 })
    budget.consume("read")
    budget.consume("client")
    budget.consume("write")

    expect(() => budget.consume("read")).toThrow("Agent tool limit reached")
  })

  it("enforces the lower write-action budget without consuming a failed call", () => {
    const budget = createAgentToolBudget({ calls: 3, writes: 1 })
    budget.consume("write")
    expect(() => budget.consume("write")).toThrow(
      "Agent write action limit reached"
    )
    budget.consume("read")
    budget.consume("client")
    expect(() => budget.consume("read")).toThrow("Agent tool limit reached")
  })

  it("fails every tool kind closed after an action waits for approval", () => {
    const budget = createAgentToolBudget()
    budget.consume("write")
    budget.suspendForApproval()
    budget.suspendForApproval()

    for (const kind of ["read", "write", "client"] as const) {
      expect(() => budget.consume(kind)).toThrow(
        "Agent tools suspended for approval"
      )
    }
  })
})
