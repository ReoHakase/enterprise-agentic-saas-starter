import { expect, userEvent, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip"

const triggerButton = <Button variant="outline" />
const contextTriggerId = "context-tooltip-trigger"

const ContextTooltip = () => (
  <TooltipProvider>
    <Tooltip open triggerId={contextTriggerId}>
      <TooltipTrigger id={contextTriggerId} render={triggerButton}>
        Context
      </TooltipTrigger>
      <TooltipContent>12% of the context window is used.</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

const meta = preview.meta({
  title: "Components/Tooltip",
  component: ContextTooltip,
  tags: ["autodocs"],
})

export const KeyboardFocus = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("Reveal the description from keyboard focus", async () => {
      const trigger = canvas.getByRole("button", { name: "Context" })
      await userEvent.tab()
      await expect(trigger).toHaveFocus()
      await expect(
        await within(canvasElement.ownerDocument.body).findByText(
          "12% of the context window is used."
        )
      ).toBeVisible()
      await userEvent.tab()
      await expect(trigger).not.toHaveFocus()
    })
  },
})

export const LongExplanation = meta.story({
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={triggerButton}>
          Permission details
        </TooltipTrigger>
        <TooltipContent>
          Only Acme Cloud owners can rotate production credentials or transfer
          organization ownership.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
})
