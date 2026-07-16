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
    expect(
      screen.getByRole("dialog", { name: "Invite member" })
    ).toHaveAccessibleDescription("Send access to a verified email address.")

    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(
      screen.queryByRole("dialog", { name: "Invite member" })
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
