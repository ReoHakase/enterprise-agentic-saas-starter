import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Button } from "./button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog"

const dialogTriggerButtonRender = <Button />

describe("Dialog", () => {
  it("opens with an accessible title and returns focus when closed", async () => {
    const user = userEvent.setup()

    render(
      <Dialog>
        <DialogTrigger render={dialogTriggerButtonRender}>
          Invite member
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Send access to a verified email address.
          </DialogDescription>
        </DialogContent>
      </Dialog>
    )

    const trigger = screen.getByRole("button", { name: "Invite member" })
    await user.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "Invite member" })
    expect(dialog).toHaveAccessibleDescription(
      "Send access to a verified email address."
    )
    expect(dialog).toHaveAttribute("data-motion", "scale")
    expect(dialog).toHaveClass("data-closed:pointer-events-none")

    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(
      screen.queryByRole("dialog", { name: "Invite member" })
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("supports fade-only motion for dimension-sensitive content", async () => {
    const user = userEvent.setup()

    render(
      <Dialog>
        <DialogTrigger render={dialogTriggerButtonRender}>
          Crop image
        </DialogTrigger>
        <DialogContent motion="fade">
          <DialogTitle>Crop image</DialogTitle>
          <DialogDescription>Choose the visible area.</DialogDescription>
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByRole("button", { name: "Crop image" }))
    const dialog = screen.getByRole("dialog", { name: "Crop image" })

    expect(dialog).toHaveAttribute("data-motion", "fade")
    expect(dialog).not.toHaveClass("data-open:zoom-in-95")
    expect(dialog).not.toHaveClass("data-closed:zoom-out-95")
  })
})
