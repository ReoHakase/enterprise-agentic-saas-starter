import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Input } from "./input"

const meta = preview.meta({
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    "aria-label": "Organization name",
    placeholder: "Acme Cloud",
  },
})

export const Empty = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Enter an organization name", async () => {
      const input = canvas.getByRole("textbox", { name: "Organization name" })
      await userEvent.type(input, "Acme Cloud")
      await expect(input).toHaveValue("Acme Cloud")
      await expect(input).toHaveFocus()
    })
  },
})

export const Filled = meta.story({
  args: { defaultValue: "Acme Cloud" },
})

export const RequiredInvalid = meta.story({
  args: {
    "aria-invalid": true,
    "aria-describedby": "organization-name-error",
    required: true,
  },
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Input {...args} />
      <p
        id="organization-name-error"
        role="alert"
        className="text-sm text-destructive"
      >
        Enter an organization name.
      </p>
    </div>
  ),
})

export const Disabled = meta.story({
  args: { disabled: true, value: "Acme Cloud", readOnly: true },
})
