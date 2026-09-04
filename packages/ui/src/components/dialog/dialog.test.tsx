import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Button } from "../button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog"

const dialogTriggerButtonRender = <Button />

const renderInviteDialog = () =>
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

describe("Dialogのmotion契約", () => {
  it("標準表示はスケールモーションを適用する", async () => {
    const user = userEvent.setup()
    renderInviteDialog()

    await user.click(screen.getByRole("button", { name: "Invite member" }))
    const dialog = screen.getByRole("dialog", { name: "Invite member" })
    expect(dialog).toHaveAttribute("data-motion", "scale")
  })

  it("寸法に敏感な内容はフェードモーションだけを適用する", async () => {
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
  })
})
