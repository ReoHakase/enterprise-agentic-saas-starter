import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Textarea } from "./textarea"

const meta = preview.meta({
  title: "Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    "aria-label": "Issue description",
    placeholder: "Describe the expected outcome",
  },
})

export const Empty = meta.story({
  play: async ({ canvas, step }) => {
    await step("Enter a multiline issue description", async () => {
      const field = canvas.getByRole("textbox", { name: "Issue description" })
      await userEvent.type(
        field,
        "Review production access.{enter}Due July 31."
      )
      await expect(field).toHaveValue("Review production access.\nDue July 31.")
    })
  },
})

export const Filled = meta.story({
  args: {
    defaultValue:
      "Review every administrator account before the quarterly security audit.",
  },
})

export const Invalid = meta.story({
  args: {
    "aria-invalid": true,
    "aria-describedby": "issue-description-error",
    defaultValue: "Review",
  },
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Textarea {...args} />
      <p
        id="issue-description-error"
        role="alert"
        className="text-sm text-destructive"
      >
        Add at least 20 characters.
      </p>
    </div>
  ),
})

export const Disabled = meta.story({
  args: {
    disabled: true,
    value: "You do not have permission to edit this issue.",
    readOnly: true,
  },
})
