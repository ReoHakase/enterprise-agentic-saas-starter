import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover"

const triggerButton = <Button variant="outline" />

const ContextUsagePopover = () => (
  <Popover>
    <PopoverTrigger render={triggerButton}>Context usage</PopoverTrigger>
    <PopoverContent>
      <PopoverHeader>
        <PopoverTitle>Agent context</PopoverTitle>
        <PopoverDescription>
          12% of the available context is used by this conversation.
        </PopoverDescription>
      </PopoverHeader>
    </PopoverContent>
  </Popover>
)

const meta = preview.meta({
  title: "Components/Popover",
  component: ContextUsagePopover,
  tags: ["autodocs"],
})

export const ContextUsage = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("Open and dismiss with Escape", async () => {
      const trigger = canvas.getByRole("button", { name: "Context usage" })
      await userEvent.click(trigger)
      const body = within(canvasElement.ownerDocument.body)
      await expect(
        body.getByRole("dialog", { name: "Agent context" })
      ).toHaveAccessibleDescription(
        "12% of the available context is used by this conversation."
      )
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})
