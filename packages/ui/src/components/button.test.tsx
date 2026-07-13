import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Button } from "./button"

describe("Button", () => {
  it("supports an accessible name and click interaction", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<Button onClick={onClick}>Create organization</Button>)
    await user.click(
      screen.getByRole("button", { name: "Create organization" })
    )

    expect(onClick).toHaveBeenCalledOnce()
  })
})
