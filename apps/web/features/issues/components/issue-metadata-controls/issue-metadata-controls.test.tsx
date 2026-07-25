import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { IssueDueDateTimeControl } from "./issue-metadata-controls"

const initialDueDate = "2026-07-20T09:30:00.000Z"

describe("IssueDueDateTimeControl", () => {
  it("keeps a local draft and commits it once when the picker closes", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn<(value: string | null) => void>()
    const currentHour = new Date(initialDueDate).getHours()
    const nextHour = ((currentHour + 1) % 24).toString().padStart(2, "0")

    render(
      <IssueDueDateTimeControl
        value={initialDueDate}
        ariaLabel="Issue due date and time"
        onValueChange={onValueChange}
      />
    )

    expect(onValueChange).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "Issue due date and time" })
    )
    expect(
      screen.getByRole("combobox", { name: "Due hour" })
    ).toHaveTextContent(currentHour.toString().padStart(2, "0"))
    expect(
      screen.getByRole("combobox", { name: "Due minute" })
    ).toHaveTextContent("30")
    await user.click(screen.getByRole("combobox", { name: "Due hour" }))
    await user.click(screen.getByRole("option", { name: nextHour }))

    expect(screen.getByRole("grid")).toBeVisible()
    expect(onValueChange).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")

    expect(onValueChange).toHaveBeenCalledOnce()
    const nextValue = onValueChange.mock.calls[0]?.[0]
    expect(nextValue).not.toBeNull()
    expect(new Date(String(nextValue)).getHours()).toBe(Number(nextHour))
  })

  it("does not commit on an unchanged close or closed prop synchronization", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn<(value: string | null) => void>()
    const view = render(
      <IssueDueDateTimeControl
        value={initialDueDate}
        ariaLabel="Issue due date and time"
        onValueChange={onValueChange}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Issue due date and time" })
    )
    await user.keyboard("{Escape}")
    expect(onValueChange).not.toHaveBeenCalled()

    view.rerender(
      <IssueDueDateTimeControl
        value="2026-07-21T12:45:00.000Z"
        ariaLabel="Issue due date and time"
        onValueChange={onValueChange}
      />
    )
    await user.click(
      screen.getByRole("button", { name: "Issue due date and time" })
    )
    await user.keyboard("{Escape}")

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("commits the draft when an outside interaction closes the picker", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn<(value: string | null) => void>()

    render(
      <>
        <IssueDueDateTimeControl
          value={initialDueDate}
          ariaLabel="Issue due date and time"
          onValueChange={onValueChange}
        />
        <button type="button">Outside</button>
      </>
    )

    await user.click(
      screen.getByRole("button", { name: "Issue due date and time" })
    )
    await user.click(screen.getByRole("combobox", { name: "Due minute" }))
    await user.click(screen.getByRole("option", { name: "45" }))
    expect(onValueChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Outside" }))

    expect(onValueChange).toHaveBeenCalledOnce()
    const nextValue = onValueChange.mock.calls[0]?.[0]
    expect(nextValue).not.toBeNull()
    expect(new Date(String(nextValue)).getMinutes()).toBe(45)
  })

  it("commits clearing once as the picker closes", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn<(value: string | null) => void>()

    render(
      <IssueDueDateTimeControl
        value={initialDueDate}
        ariaLabel="Issue due date and time"
        onValueChange={onValueChange}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Issue due date and time" })
    )
    await user.click(screen.getByRole("button", { name: "Clear" }))

    expect(screen.queryByRole("grid")).not.toBeInTheDocument()
    expect(onValueChange).toHaveBeenCalledOnce()
    expect(onValueChange).toHaveBeenCalledWith(null)
  })
})
