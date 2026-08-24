import { describe, expect, it } from "vitest"

import { createAgentToolBudget } from "./tool"

describe("createAgentToolBudgetの契約", () => {
  it("readとwriteとclient toolで総呼出budgetを共有する", () => {
    const budget = createAgentToolBudget({ calls: 3, writes: 2 })
    budget.consume("read")
    budget.consume("client")
    budget.consume("write")

    expect(() => budget.consume("read")).toThrow("Agent tool limit reached")
  })

  it("失敗呼出を消費せず小さいwrite action budgetを強制する", () => {
    const budget = createAgentToolBudget({ calls: 3, writes: 1 })
    budget.consume("write")
    expect(() => budget.consume("write")).toThrow(
      "Agent write action limit reached"
    )
    budget.consume("read")
    budget.consume("client")
    expect(() => budget.consume("read")).toThrow("Agent tool limit reached")
  })

  it("actionがapproval待ちになった後は全tool種別を安全側に失敗させる", () => {
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
