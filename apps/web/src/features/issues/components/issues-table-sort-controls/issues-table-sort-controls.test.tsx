import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  defaultIssueSearchState,
  type IssueSearchPatch,
} from "../../search-params"
import { IssuesTableSortControls } from "./issues-table-sort-controls"

const getClickableOption = async (name: string) =>
  waitFor(() => {
    const option = screen
      .getAllByRole("option", { name })
      .find((candidate) => getComputedStyle(candidate).pointerEvents !== "none")
    expect(option).toBeDefined()
    if (!option) throw new Error(`Expected a clickable ${name} option`)
    return option
  })

describe("IssueTableSortControlsの契約", () => {
  it("sort項目を選択してpatchをcommitする", async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn<(patch: IssueSearchPatch) => void>()
    render(
      <IssuesTableSortControls
        state={defaultIssueSearchState}
        onViewChange={onViewChange}
      />
    )

    const sortTrigger = screen.getByRole("combobox", { name: "Sort issues" })
    expect(sortTrigger).toHaveTextContent("Updated")
    await user.click(sortTrigger)
    await user.click(await getClickableOption("Priority"))
    expect(onViewChange).toHaveBeenLastCalledWith({
      sort: "priority",
      page: 1,
    })
  })

  it("sort方向を選択してpatchをcommitする", async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn<(patch: IssueSearchPatch) => void>()
    render(
      <IssuesTableSortControls
        state={defaultIssueSearchState}
        onViewChange={onViewChange}
      />
    )

    const directionTrigger = screen.getByRole("combobox", {
      name: "Set issue sort direction",
    })
    expect(directionTrigger).toHaveTextContent("Descending")
    await user.click(directionTrigger)
    const ascending = await getClickableOption("Ascending")
    await user.click(ascending)
    expect(onViewChange).toHaveBeenLastCalledWith({ dir: "asc", page: 1 })
  })
})
