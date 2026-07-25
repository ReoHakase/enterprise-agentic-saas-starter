import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select"

const roleItems = {
  admin: "Administrator",
  member: "Member",
  viewer: "Viewer",
}
const noItems = {}

const meta = preview.meta({
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
})

const RoleSelect = ({ disabled = false }: { disabled?: boolean }) => (
  <Select
    items={roleItems}
    defaultValue="member"
    disabled={disabled}
    onValueChange={fn()}
  >
    <SelectTrigger aria-label="Organization role">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Acme Cloud roles</SelectLabel>
        <SelectItem value="admin">Administrator</SelectItem>
        <SelectSeparator />
        <SelectItem value="member">Member</SelectItem>
        <SelectItem value="viewer">Viewer</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)

export const Role = meta.story({
  render: () => <RoleSelect />,
  play: async ({ canvas, canvasElement, step }) => {
    await step("Select an administrator role", async () => {
      const trigger = canvas.getByRole("combobox", {
        name: "Organization role",
      })
      await userEvent.click(trigger)
      const body = within(canvasElement.ownerDocument.body)
      await userEvent.click(
        await body.findByRole("option", { name: "Administrator" })
      )
      await expect(trigger).toHaveTextContent("Administrator")
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})

export const Disabled = meta.story({
  render: () => <RoleSelect disabled />,
})

export const NoOptions = meta.story({
  render: () => (
    <Select items={noItems}>
      <SelectTrigger aria-label="Available workspace">
        <SelectValue placeholder="No workspaces available" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Workspaces</SelectLabel>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
})
