import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import type { IssueSearchState } from "../../search-params"
import {
  IssueAssigneeFilter,
  IssueLabelFilter,
  type IssueTableDraftChange,
} from "./issues-table-searchable-filters"

const emptyValues: string[] = []
const labelOptions = ["billing", "incident"]
const assigneeOptions = [
  {
    id: "user-current",
    name: "Jordan Lee",
    email: "jordan@example.test",
    profileImage: null,
  },
  {
    id: "user-taylor",
    name: "Taylor Morgan",
    email: "taylor@example.test",
    profileImage: null,
  },
]
const onSearchChange = vi.fn<(search: string) => void>()
const onApply = vi.fn<() => void>()

const LabelFilterProbe = ({
  onChange,
}: {
  onChange: IssueTableDraftChange
}) => {
  const [mode, setMode] = useState<IssueSearchState["labelMode"]>("any")
  const handleChange: IssueTableDraftChange = useCallback(
    (key, value) => {
      onChange(key, value)
      if (key === "labelMode" && (value === "any" || value === "all")) {
        setMode(value)
      }
    },
    [onChange]
  )
  return (
    <IssueLabelFilter
      values={emptyValues}
      mode={mode}
      options={labelOptions}
      onSearchChange={onSearchChange}
      onChange={handleChange}
      onApply={onApply}
    />
  )
}

describe("IssueLabelFilter", () => {
  it("keeps Match any or Match all visibly selected and required", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<IssueTableDraftChange>()
    render(<LabelFilterProbe onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Labels" }))
    const any = screen.getByRole("button", { name: "Match any" })
    const all = screen.getByRole("button", { name: "Match all" })
    expect(any).toHaveAttribute("aria-pressed", "true")
    expect(
      within(any).queryByTestId("label-mode-any-icon")
    ).not.toBeInTheDocument()
    expect(
      within(all).queryByTestId("label-mode-all-icon")
    ).not.toBeInTheDocument()

    await user.click(all)
    expect(onChange).toHaveBeenLastCalledWith("labelMode", "all")
    expect(all).toHaveAttribute("aria-pressed", "true")
    await user.click(all)
    expect(all).toHaveAttribute("aria-pressed", "true")

    await user.click(any)
    expect(onChange).toHaveBeenLastCalledWith("labelMode", "any")
    expect(any).toHaveAttribute("aria-pressed", "true")
  })
})

describe("IssueAssigneeFilter", () => {
  it("keeps typed search text in the Base UI input and supports arrow selection", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<IssueTableDraftChange>()
    render(
      <IssueAssigneeFilter
        values={emptyValues}
        assignees={assigneeOptions}
        currentUserId="user-current"
        onChange={onChange}
        onApply={onApply}
      />
    )

    await user.click(screen.getByRole("button", { name: "Assignee" }))
    const input = await screen.findByRole("combobox", {
      name: "Search assignee",
    })
    await user.click(input)
    await user.type(input, "Taylor")
    expect(input).toHaveValue("Taylor")
    expect(screen.getByRole("option", { name: "Taylor Morgan" })).toBeVisible()

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}")
    expect(onChange).toHaveBeenLastCalledWith("assignees", ["user-taylor"])
  })
})
