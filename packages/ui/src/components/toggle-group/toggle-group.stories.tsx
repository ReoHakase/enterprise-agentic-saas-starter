import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { ToggleGroup, ToggleGroupItem } from "./toggle-group"

const onValueChange = fn()

const meta = preview.meta({
  title: "Components/Toggle Group",
  component: ToggleGroup,
  tags: ["autodocs"],
})

export const RequiredSingle = meta.story({
  render: () => (
    <ToggleGroup
      type="single"
      defaultValue="or"
      required
      onValueChange={onValueChange}
      aria-label="Label match mode"
    >
      <ToggleGroupItem value="or">OR</ToggleGroupItem>
      <ToggleGroupItem value="and">AND</ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvas }) => {
    const or = canvas.getByRole("button", { name: "OR" })
    const and = canvas.getByRole("button", { name: "AND" })
    await expect(or).toHaveAttribute("aria-pressed", "true")
    onValueChange.mockClear()
    await userEvent.click(or)
    await expect(or).toHaveAttribute("aria-pressed", "true")
    await expect(onValueChange).not.toHaveBeenCalled()
    or.focus()
    await userEvent.keyboard("{ArrowRight}{Enter}")
    await expect(and).toHaveAttribute("aria-pressed", "true")
    await expect(onValueChange).toHaveBeenCalledWith("and")
  },
})
