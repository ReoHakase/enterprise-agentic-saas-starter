import preview from "#storybook/preview"

import { Label } from "../label/label"
import { Switch } from "./switch"

const meta = preview.meta({
  title: "Components/Switch",
  component: Switch,
  tags: ["autodocs"],
  args: {
    "aria-label": "Email security updates",
  },
})

export const Off = meta.story({})

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
