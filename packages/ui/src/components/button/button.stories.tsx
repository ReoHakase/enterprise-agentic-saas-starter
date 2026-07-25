import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "./button"

const meta = preview.meta({
  title: "Components/Button",
  component: Button,
  tags: ["autodocs", "theme-sensitive"],
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
  args: {
    onClick: fn(),
  },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", {
      name: "Create organization",
    })
    await expect(button).toBeEnabled()
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
})

export const Destructive = meta.story({
  args: {
    children: "Delete organization",
    variant: "destructive",
    onClick: fn(),
  },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", {
      name: "Delete organization",
    })
    await expect(button).toBeEnabled()
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
})

export const Disabled = meta.story({
  args: {
    children: "Invitation sent",
    disabled: true,
    onClick: fn(),
  },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Invitation sent" })
    await expect(button).toBeDisabled()
    await expect(args.onClick).not.toHaveBeenCalled()
  },
})
