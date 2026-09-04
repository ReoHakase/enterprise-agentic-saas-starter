import preview from "#storybook/preview"

import { Label } from "../label/label"
import { Checkbox } from "./checkbox"

const meta = preview.meta({
  title: "Components/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  args: {
    "aria-label": "Include completed issues",
  },
})

export const Unchecked = meta.story({})

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
