import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Label } from "../label/label"
import { Switch } from "./switch"

const meta = preview.meta({
  title: "Components/Switch",
  component: Switch,
  tags: ["autodocs"],
  args: {
    "aria-label": "Email security updates",
    onCheckedChange: fn(),
  },
})

export const Off = meta.story({
  play: async ({ args, canvas, step }) => {
    await step("Enable notifications with Space", async () => {
      const toggle = canvas.getByRole("switch", {
        name: "Email security updates",
      })
      toggle.focus()
      await userEvent.keyboard(" ")
      await expect(toggle).toBeChecked()
      await expect(args.onCheckedChange).toHaveBeenCalled()
      await expect(args.onCheckedChange?.mock.calls[0]?.[0]).toBe(true)
    })
  },
})

export const On = meta.story({
  args: { defaultChecked: true },
})

export const Disabled = meta.story({
  args: { disabled: true },
  render: (args) => (
    <Label className="flex items-center gap-2">
      <Switch {...args} /> Enforce single sign-on
    </Label>
  ),
})
