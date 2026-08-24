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

export const Empty = meta.story({})

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
