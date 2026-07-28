import { render, screen, waitFor, within } from "@testing-library/react"
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

describe("IssuesTableSortControls", () => {
  it("renders explicit labels and icons and commits sort patches", async () => {
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
    expect(sortTrigger).not.toHaveTextContent("updatedAt")
    expect(
      within(sortTrigger).getByTestId("sort-icon-updatedAt")
    ).toBeInTheDocument()

    await user.click(sortTrigger)
    const presentations = [
      ["Number", "number"],
      ["Created", "createdAt"],
      ["Updated", "updatedAt"],
      ["Due date", "dueDate"],
      ["Priority", "priority"],
      ["Status", "status"],
    ] as const
    const options = await Promise.all(
      presentations.map(([label]) => getClickableOption(label))
    )
    for (const [index, option] of options.entries()) {
      const value = presentations[index]?.[1]
      if (!value) throw new Error("Expected a sort presentation")
      expect(
        within(option).getByTestId(`sort-option-icon-${value}`)
      ).toBeInTheDocument()
    }
    await user.click(await getClickableOption("Priority"))
    expect(onViewChange).toHaveBeenLastCalledWith({
      sort: "priority",
      page: 1,
    })

    const directionTrigger = screen.getByRole("combobox", {
      name: "Set issue sort direction",
    })
    expect(directionTrigger).toHaveTextContent("Descending")
    expect(
      within(directionTrigger).getByTestId("sort-direction-icon-desc")
    ).toBeInTheDocument()
    await user.click(directionTrigger)
    const ascending = await getClickableOption("Ascending")
    const descending = await getClickableOption("Descending")
    expect(
      within(ascending).getByTestId("sort-direction-option-icon-asc")
    ).toBeInTheDocument()
    expect(
      within(descending).getByTestId("sort-direction-option-icon-desc")
    ).toBeInTheDocument()
    await user.click(ascending)
    expect(onViewChange).toHaveBeenLastCalledWith({ dir: "asc", page: 1 })
  })
})
