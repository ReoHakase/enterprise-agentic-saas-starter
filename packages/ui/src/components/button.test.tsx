import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Button } from "./button"

describe("Button", () => {
  it("supports an accessible name and click interaction", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn<() => void>()

    render(<Button onClick={onClick}>Create organization</Button>)
    await user.click(
      screen.getByRole("button", { name: "Create organization" })
    )

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("supports keyboard activation and exposes focus", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn<() => void>()

    render(<Button onClick={onClick}>Open issue</Button>)
    await user.tab()
    expect(screen.getByRole("button", { name: "Open issue" })).toHaveFocus()
    await user.keyboard("{Enter}")

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("does not activate while disabled", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn<() => void>()

    render(
      <Button disabled onClick={onClick}>
        Invitation sent
      </Button>
    )
    const button = screen.getByRole("button", { name: "Invitation sent" })

    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
