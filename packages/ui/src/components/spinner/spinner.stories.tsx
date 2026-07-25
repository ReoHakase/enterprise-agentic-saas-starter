import preview from "#storybook/preview"

import { Button } from "../button/button"
import { Spinner } from "./spinner"

const meta = preview.meta({
  title: "Components/Spinner",
  component: Spinner,
  tags: ["autodocs"],
})

export const Sizes = meta.story({
  render: () => (
    <div className="flex items-center gap-5">
      <Spinner aria-label="Loading compact result" className="size-3" />
      <Spinner aria-label="Loading result" />
      <Spinner aria-label="Loading large result" className="size-8" />
    </div>
  ),
})

export const PendingButton = meta.story({
  render: () => (
    <Button disabled>
      <Spinner aria-hidden="true" />
      Sending invitation…
    </Button>
  ),
})
