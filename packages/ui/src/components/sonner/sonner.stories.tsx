import { toast } from "sonner"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import { Toaster } from "./sonner"

const showSuccess = () =>
  toast.success("Invitation sent", {
    description: "jordan@example.test can now join Acme Cloud.",
  })
const showError = () =>
  toast.error("Invitation failed", {
    description: "Try again after checking the member limit.",
  })
const showLoading = () => toast.loading("Uploading security-review.pdf")

const NotificationsFixture = () => (
  <div className="flex gap-2">
    <Toaster />
    <Button onClick={showSuccess}>Show success</Button>
    <Button variant="destructive" onClick={showError}>
      Show error
    </Button>
    <Button variant="outline" onClick={showLoading}>
      Show loading
    </Button>
  </div>
)

const meta = preview.meta({
  title: "Components/Sonner",
  component: NotificationsFixture,
  tags: ["autodocs"],
})

export const Notifications = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement, step }) => {
    await step("招待成功を通知する", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Show success" })
      )
      const body = within(canvasElement.ownerDocument.body)
      await waitFor(() =>
        expect(
          body
            .queryAllByText("Invitation sent")
            .some((element) => element.checkVisibility())
        ).toBe(true)
      )
      await waitFor(() =>
        expect(
          body
            .queryAllByText("jordan@example.test can now join Acme Cloud.")
            .some((element) => element.checkVisibility())
        ).toBe(true)
      )
    })
  },
})
