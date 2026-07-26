import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Slider } from "./slider"

const priorityLabel = () => "Priority threshold"

const meta = preview.meta({
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs"],
  args: {
    defaultValue: 40,
    getAriaLabel: priorityLabel,
    onValueChange: fn(),
  },
})

export const SingleValue = meta.story({
  play: async ({ args, canvas, step }) => {
    await step("Increase the threshold with ArrowRight", async () => {
      const slider = canvas.getByRole("slider", { name: "Priority threshold" })
      slider.focus()
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
