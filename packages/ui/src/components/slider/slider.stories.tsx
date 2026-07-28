import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import { Slider } from "./slider"

const priorityLabel = () => "Priority threshold"

const meta = preview.meta({
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs", "theme-sensitive"],
  args: {
    defaultValue: 40,
    getAriaLabel: priorityLabel,
    onValueChange: fn(),
  },
})

export const SingleValue = meta.story({
  play: async ({ args, canvas, canvasElement, step }) => {
    await step("Increase the threshold with ArrowRight", async () => {
      const slider = canvas.getByRole("slider", { name: "Priority threshold" })
      const thumb = slider.closest<HTMLElement>('[data-slot="slider-thumb"]')
      if (!thumb) throw new globalThis.Error("Expected visible slider thumb")
      const shadowBeforeFocus = getComputedStyle(thumb).boxShadow
      canvasElement.ownerDocument.body.focus()
      await userEvent.tab()
      await expect(slider).toHaveFocus()
      await waitFor(() =>
        expect(getComputedStyle(thumb).boxShadow).not.toBe(shadowBeforeFocus)
      )
      await userEvent.keyboard("{ArrowRight}")
      await expect(slider).toHaveAttribute("aria-valuenow", "41")
      await expect(args.onValueChange).toHaveBeenCalled()
    })
  },
})

export const Range = meta.story({
  args: {
    defaultValue: [20, 80],
  },
})

export const Disabled = meta.story({
  args: { defaultValue: 65, disabled: true },
})
