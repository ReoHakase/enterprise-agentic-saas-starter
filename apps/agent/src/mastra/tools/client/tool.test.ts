import { describe, expect, it, vi } from "vitest"

import { createAgentClientTools } from "./tool"

describe("createAgentClientToolsの契約", () => {
  it("client実行toolを五つだけ定義する", () => {
    const consume = vi.fn<(kind: "client" | "read" | "write") => void>()
    const tools = createAgentClientTools({
      consume,
      suspendForApproval: vi.fn<() => void>(),
    })

    expect(Object.keys(tools).toSorted()).toEqual([
      "ui_navigate",
      "ui_open_issue",
      "ui_patch_form_draft",
      "ui_read_form_draft",
      "ui_set_issue_query",
    ])
    expect(tools.ui_navigate.execute).toBeUndefined()
  })

  it("client tool入力で共通budgetを消費する", async () => {
    const consume = vi.fn<(kind: "client" | "read" | "write") => void>()
    const tools = createAgentClientTools({
      consume,
      suspendForApproval: vi.fn<() => void>(),
    })

    await tools.ui_navigate.onInputAvailable?.({
      input: { page: "issues" },
      messages: [],
      toolCallId: "call_1",
    })
    expect(consume).toHaveBeenCalledWith("client")
  })
})
