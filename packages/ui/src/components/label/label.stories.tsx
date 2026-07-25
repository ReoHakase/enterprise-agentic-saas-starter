import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Checkbox } from "../checkbox/checkbox"
import { Input } from "../input/input"
import { Label } from "./label"

const meta = preview.meta({
  title: "Components/Label",
  component: Label,
  tags: ["autodocs"],
})

export const TextField = meta.story({
  render: () => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="workspace-name">Workspace name</Label>
      <Input id="workspace-name" defaultValue="Acme Cloud" />
    </div>
  ),
  play: async ({ canvas, step }) => {
    await step("Focus the labelled field", async () => {
      await userEvent.click(canvas.getByText("Workspace name"))
      await expect(
        canvas.getByRole("textbox", { name: "Workspace name" })
      ).toHaveFocus()
    })
  },
})

export const CheckboxLabel = meta.story({
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="security-updates" />
      <Label htmlFor="security-updates">Email security updates</Label>
    </div>
  ),
})

export const Disabled = meta.story({
  render: () => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="verified-domain">Verified domain</Label>
      <Input id="verified-domain" value="acme.example.test" disabled readOnly />
    </div>
  ),
})
