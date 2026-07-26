import { toast } from "sonner"
import { expect, userEvent, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import { Toaster } from "./sonner"

const showSuccess = () =>
  toast.success("Invitation sent", {
    description: "jordan@example.test can now join Acme Cloud.",
    testId: "invitation-success",
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
    await step("Announce a successful invitation", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Show success" })
      )
      const body = within(canvasElement.ownerDocument.body)
      await expect(
        await body.findByTestId("invitation-success")
      ).toHaveTextContent("Invitation sent")
      await expect(body.getByTestId("invitation-success")).toHaveTextContent(
        "jordan@example.test can now join Acme Cloud."
      )
    })
  },
})
