import { render, screen } from "@testing-library/react"
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
const julySingleState = {
  ...defaultIssueSearchState,
  dueFrom: "2026-07-10",
  dueTo: "2026-07-10",
  dueFromOffset: getLocalBoundaryOffset("2026-07-10"),
  dueToOffset: getLocalBoundaryOffset("2026-07-10", 1),
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

describe("DueDateFilterのローカル境界", () => {
  it("ブラウザーのタイムゾーンに依存せず日付だけの概要を整形する", () => {
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

  it("popover内にrange calendarを1つだけ描画する", async () => {
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

  it("1日だけを同日の範囲として選択する", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    render(<DueDateRequestProbe />)

    await user.click(screen.getByRole("button", { name: "Due date" }))
    await user.click(screen.getByRole("button", { name: /Friday, July 10/u }))
    expect(getRequest()).toMatchObject({
      dueDateFrom: "2026-07-10",
      dueDateTo: "2026-07-10",
      dueDateFromOffsetMinutes: getLocalBoundaryOffset("2026-07-10"),
      dueDateToExclusiveOffsetMinutes: getLocalBoundaryOffset("2026-07-10", 1),
    })
  })

  it("選択済みの同日範囲をclearする", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    render(<DueDateRequestProbe initialState={julySingleState} />)

    await user.click(screen.getByRole("button", { name: "Due date" }))
    await user.click(screen.getByRole("button", { name: /Friday, July 10/u }))
    expect(getRequest()).not.toHaveProperty("dueDateFrom")
    expect(getRequest()).not.toHaveProperty("dueDateTo")
  })

  it("開始日と終了日から完全な範囲を選択する", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    render(<DueDateRequestProbe />)

    await user.click(screen.getByRole("button", { name: "Due date" }))
    await user.click(screen.getByRole("button", { name: /Friday, July 10/u }))
    await user.click(screen.getByRole("button", { name: /Tuesday, July 14/u }))
    expect(getRequest()).toMatchObject({
      dueDateFrom: "2026-07-10",
      dueDateTo: "2026-07-14",
      dueDateFromOffsetMinutes: getLocalBoundaryOffset("2026-07-10"),
      dueDateToExclusiveOffsetMinutes: getLocalBoundaryOffset("2026-07-14", 1),
    })
  })

  it("propsで受け取った部分範囲を完成させる", async () => {
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

  it("当月外のdueToだけの日付を範囲anchorに使う", async () => {
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

  it("DST遷移をまたいで選択した各ローカル境界のoffsetを使う", async () => {
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

  it("閉じるとき1回だけ適用する", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 6, 1, 12))
    const user = userEvent.setup()
    const onApply = vi.fn<() => void>()
    render(<DueDateRequestProbe onApply={onApply} />)

    await user.click(screen.getByRole("button", { name: "Due date" }))
    await user.keyboard("{Escape}")

    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
