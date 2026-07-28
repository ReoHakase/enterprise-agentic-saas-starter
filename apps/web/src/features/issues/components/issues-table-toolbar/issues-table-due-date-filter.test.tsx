import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  defaultIssueSearchState,
  toIssueListRequest,
  type IssueSearchState,
} from "../../search-params"
import { getLocalBoundaryOffset } from "./due-date-local-calendar"
import { DueDateFilter } from "./issues-table-due-date-filter"
import type { IssueTableDraftChange } from "./issues-table-searchable-filters"

const noop = () => undefined
const julyPartialState = {
  ...defaultIssueSearchState,
  dueFrom: "2026-07-10",
  dueFromOffset: getLocalBoundaryOffset("2026-07-10"),
} satisfies IssueSearchState
const decemberDueToOnlyState = {
  ...defaultIssueSearchState,
  dueTo: "2026-12-10",
  dueToOffset: getLocalBoundaryOffset("2026-12-10", 1),
} satisfies IssueSearchState

const DueDateRequestProbe = ({
  initialState = defaultIssueSearchState,
  onApply = noop,
}: {
  initialState?: IssueSearchState
  onApply?: () => void
}) => {
  const [state, setState] = useState<IssueSearchState>(initialState)
  const handleChange: IssueTableDraftChange = useCallback(
    (key, value) => setState((current) => ({ ...current, [key]: value })),
    []
  )
  return (
    <>
      <DueDateFilter
        dueFrom={state.dueFrom}
        dueTo={state.dueTo}
        onChange={handleChange}
        onApply={onApply}
      />
      <output aria-label="Issue list request">
        {JSON.stringify(toIssueListRequest("org-1", state))}
      </output>
    </>
  )
}

const getRequest = () =>
  JSON.parse(screen.getByLabelText("Issue list request").textContent ?? "{}")

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("DueDateFilter local boundaries", () => {
  it("formats date-only summaries without depending on the browser timezone", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 28, 12))
    const { rerender } = render(
      <DueDateFilter
        dueFrom="2026-06-07"
        dueTo="2026-06-18"
        onChange={noop}
        onApply={noop}
      />
    )
    const trigger = screen.getByRole("button", { name: "Due date" })
    expect(trigger).toHaveAccessibleDescription(
      "Due date filter: Jun 7 – Jun 18"
    )

    rerender(
      <DueDateFilter
        dueFrom="2026-06-07"
        dueTo=""
        onChange={noop}
        onApply={noop}
      />
    )
    expect(trigger).toHaveAccessibleDescription("Due date filter: From Jun 7")

    rerender(
      <DueDateFilter
        dueFrom=""
        dueTo="2026-06-18"
        onChange={noop}
        onApply={noop}
      />
    )
    expect(trigger).toHaveAccessibleDescription(
      "Due date filter: Through Jun 18"
    )

    rerender(
      <DueDateFilter
        dueFrom="2025-06-07"
        dueTo=""
        onChange={noop}
        onApply={noop}
      />
    )
    expect(trigger).toHaveAccessibleDescription(
      "Due date filter: From Jun 7, 2025"
    )

    rerender(
      <DueDateFilter
        dueFrom="2026-12-30"
        dueTo="2027-01-02"
        onChange={noop}
        onApply={noop}
      />
    )
    expect(trigger).toHaveAccessibleDescription(
      "Due date filter: Dec 30, 2026 – Jan 2, 2027"
    )
  })

  it("renders only one range calendar in the popover", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    render(<DueDateRequestProbe />)

    const trigger = screen.getByRole("button", { name: "Due date" })
    expect(trigger).toHaveAttribute("data-filter-state", "default")
    await user.click(trigger)

    expect(screen.getAllByRole("grid")).toHaveLength(1)
    expect(
      screen.queryByRole("group", { name: "Due date preset" })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Due date from")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Due date to")).not.toBeInTheDocument()
  })

  it("selects and clears one day, then selects a complete range", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    render(<DueDateRequestProbe />)

    await user.click(screen.getByRole("button", { name: "Due date" }))
    const july10 = screen.getByRole("button", { name: /Friday, July 10/u })
    july10.focus()
    await user.keyboard("{Enter}")
    expect(getRequest()).toMatchObject({
      dueDateFrom: "2026-07-10",
      dueDateTo: "2026-07-10",
      dueDateFromOffsetMinutes: getLocalBoundaryOffset("2026-07-10"),
      dueDateToExclusiveOffsetMinutes: getLocalBoundaryOffset("2026-07-10", 1),
    })
    await user.click(july10)
    expect(getRequest()).not.toHaveProperty("dueDateFrom")
    expect(getRequest()).not.toHaveProperty("dueDateTo")

    await user.click(july10)
    await user.click(screen.getByRole("button", { name: /Tuesday, July 14/u }))
    expect(getRequest()).toMatchObject({
      dueDateFrom: "2026-07-10",
      dueDateTo: "2026-07-14",
      dueDateFromOffsetMinutes: getLocalBoundaryOffset("2026-07-10"),
      dueDateToExclusiveOffsetMinutes: getLocalBoundaryOffset("2026-07-14", 1),
    })
  })

  it("completes a partial range received through props", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    render(<DueDateRequestProbe initialState={julyPartialState} />)

    expect(getRequest()).toMatchObject({ dueDateFrom: "2026-07-10" })
    expect(getRequest()).not.toHaveProperty("dueDateTo")
    await user.click(screen.getByRole("button", { name: "Due date" }))
    await user.click(screen.getByRole("button", { name: /Tuesday, July 14/u }))
    expect(getRequest()).toMatchObject({
      dueDateFrom: "2026-07-10",
      dueDateTo: "2026-07-14",
    })
  })

  it("uses a dueTo-only date outside the current month as the range anchor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    render(<DueDateRequestProbe initialState={decemberDueToOnlyState} />)

    expect(getRequest()).not.toHaveProperty("dueDateFrom")
    expect(getRequest()).toMatchObject({ dueDateTo: "2026-12-10" })
    await user.click(screen.getByRole("button", { name: "Due date" }))
    expect(screen.getByText("December 2026")).toBeVisible()
    expect(
      screen.getByRole("button", { name: /Thursday, December 10/u })
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: /Sunday, December 6/u })
    )

    expect(getRequest()).toMatchObject({
      dueDateFrom: "2026-12-06",
      dueDateTo: "2026-12-10",
      dueDateFromOffsetMinutes: getLocalBoundaryOffset("2026-12-06"),
      dueDateToExclusiveOffsetMinutes: getLocalBoundaryOffset("2026-12-10", 1),
    })
  })

  it("uses each selected local boundary offset across a DST transition", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 2, 1, 12))
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockImplementation(
      function getBoundaryOffset(this: Date) {
        return this.getMonth() === 2 && this.getDate() >= 8 ? 240 : 300
      }
    )
    const user = userEvent.setup()
    render(<DueDateRequestProbe />)

    await user.click(screen.getByRole("button", { name: "Due date" }))
    await user.click(screen.getByRole("button", { name: /Saturday, March 7/u }))
    await user.click(screen.getByRole("button", { name: /Friday, March 13/u }))

    expect(getRequest()).toMatchObject({
      dueDateFrom: "2026-03-07",
      dueDateTo: "2026-03-13",
      dueDateFromOffsetMinutes: 300,
      dueDateToExclusiveOffsetMinutes: 240,
    })
  })

  it("applies once on close and returns keyboard focus to the trigger", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    const onApply = vi.fn<() => void>()
    render(<DueDateRequestProbe onApply={onApply} />)

    const trigger = screen.getByRole("button", { name: "Due date" })
    await user.click(trigger)
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Go to the Previous Month" })
      ).toHaveFocus()
    )
    await user.keyboard("{Escape}")

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
