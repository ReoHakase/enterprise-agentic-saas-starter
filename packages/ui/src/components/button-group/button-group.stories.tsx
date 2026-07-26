import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "./button-group"

const meta = preview.meta({
  title: "Components/Button Group",
  component: ButtonGroup,
  tags: ["autodocs"],
})

export const Pagination = meta.story({
  args: { "aria-label": "Project pages" },
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">Previous</Button>
      <ButtonGroupText>Page 2 of 8</ButtonGroupText>
      <Button variant="outline">Next</Button>
    </ButtonGroup>
  ),
  play: async ({ canvas, step }) => {
    await step("Move between grouped controls with Tab", async () => {
      const previous = canvas.getByRole("button", { name: "Previous" })
      const next = canvas.getByRole("button", { name: "Next" })
      previous.focus()
      await userEvent.tab()
      await expect(next).toHaveFocus()
    })
  },
})

export const DestructiveChoice = meta.story({
  args: { "aria-label": "Invitation actions" },
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline" onClick={fn()}>
        Resend invitation
      </Button>
      <ButtonGroupSeparator />
      <Button variant="destructive" onClick={fn()}>
        Revoke
      </Button>
    </ButtonGroup>
  ),
})
