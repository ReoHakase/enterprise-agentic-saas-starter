import { fn } from "storybook/test"

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
})
