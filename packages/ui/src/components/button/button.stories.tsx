import preview from "#storybook/preview"

import { Button } from "./button"

const meta = preview.meta({
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Create organization",
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "outline",
        "secondary",
        "ghost",
        "destructive",
        "link",
      ],
    },
  },
})

export const Primary = meta.story({
  tags: ["theme-sensitive"],
})

export const Destructive = meta.story({
  args: {
    children: "Delete organization",
    variant: "destructive",
  },
})

export const Disabled = meta.story({
  args: {
    children: "Invitation sent",
    disabled: true,
  },
})
