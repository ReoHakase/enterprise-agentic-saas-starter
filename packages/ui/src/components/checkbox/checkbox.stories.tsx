import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Label } from "../label/label"
import { Checkbox } from "./checkbox"

const meta = preview.meta({
  title: "Components/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  args: {
    "aria-label": "Include completed issues",
    onCheckedChange: fn(),
  },
})

export const Unchecked = meta.story({
  play: async ({ args, canvas, step }) => {
    await step("Toggle using the keyboard", async () => {
      const checkbox = canvas.getByRole("checkbox", {
        name: "Include completed issues",
      })
      checkbox.focus()
      await userEvent.keyboard(" ")
      await expect(checkbox).toBeChecked()
      await expect(args.onCheckedChange).toHaveBeenCalled()
    })
  },
})

export const Checked = meta.story({
  args: { defaultChecked: true },
})

export const Disabled = meta.story({
  args: { disabled: true },
  render: (args) => (
    <Label className="flex items-center gap-2">
      <Checkbox {...args} /> Include archived projects
    </Label>
  ),
})
