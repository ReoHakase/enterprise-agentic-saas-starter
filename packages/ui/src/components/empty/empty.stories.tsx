import { SearchIcon } from "lucide-react"
import { fn } from "storybook/test"

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
})
