import { SearchIcon } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty"

const meta = preview.meta({
  title: "Components/Empty",
  component: Empty,
  tags: ["autodocs"],
})

export const NoResults = meta.story({
  args: { className: "w-[28rem]" },
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>No matching members</EmptyTitle>
        <EmptyDescription>
          No Acme Cloud members match “pending administrator”.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">Clear filters</Button>
      </EmptyContent>
    </Empty>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No matching members")).toBeVisible()
  },
})

export const FirstUse = meta.story({
  args: { className: "w-[28rem]" },
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyTitle>Create your first project</EmptyTitle>
        <EmptyDescription>
          Projects keep Acme Cloud issues, files, and activity together.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={fn()}>Create project</Button>
      </EmptyContent>
    </Empty>
  ),
  play: async ({ canvas, step }) => {
    await step("Activate the primary empty-state action", async () => {
      const button = canvas.getByRole("button", { name: "Create project" })
      await userEvent.click(button)
      await expect(button).toHaveFocus()
    })
  },
})
