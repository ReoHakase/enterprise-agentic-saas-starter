import { SearchIcon, SendIcon } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group"

const meta = preview.meta({
  title: "Components/Input Group",
  component: InputGroup,
  tags: ["autodocs"],
})

export const Search = meta.story({
  render: () => (
    <InputGroup className="w-80">
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
        <InputGroupText>Search</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput aria-label="Search Acme Cloud" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Run search" onClick={fn()}>
          <SearchIcon aria-hidden="true" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvas, step }) => {
    await step("Enter a query and activate search", async () => {
      const input = canvas.getByRole("textbox", { name: "Search Acme Cloud" })
      await userEvent.type(input, "security review")
      await userEvent.click(canvas.getByRole("button", { name: "Run search" }))
      await expect(input).toHaveValue("security review")
    })
  },
})

export const Composer = meta.story({
  render: () => (
    <InputGroup className="w-96">
      <InputGroupTextarea
        aria-label="Message Agent"
        defaultValue="Summarize open security issues."
      />
      <InputGroupAddon align="block-end" className="justify-end">
        <InputGroupButton aria-label="Send message" variant="default">
          <SendIcon aria-hidden="true" /> Send
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
})

export const Invalid = meta.story({
  render: () => (
    <InputGroup className="w-80">
      <InputGroupInput
        aria-label="Repository URL"
        aria-invalid="true"
        defaultValue="not-a-url"
      />
      <InputGroupAddon align="block-end" className="text-destructive">
        Enter a valid HTTPS URL.
      </InputGroupAddon>
    </InputGroup>
  ),
})
