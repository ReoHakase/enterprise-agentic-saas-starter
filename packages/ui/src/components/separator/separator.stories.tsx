import preview from "#storybook/preview"

import { Separator } from "./separator"

const meta = preview.meta({
  title: "Components/Separator",
  component: Separator,
  tags: ["autodocs"],
})

export const Horizontal = meta.story({
  render: () => (
    <div className="w-80 space-y-3">
      <h3 className="font-medium">Acme Cloud</h3>
      <Separator />
      <p className="text-sm text-muted-foreground">Production workspace</p>
    </div>
  ),
})

export const Vertical = meta.story({
  render: () => (
    <div className="flex h-6 items-center gap-3">
      <span>Issues</span>
      <Separator orientation="vertical" />
      <span>Files</span>
      <Separator orientation="vertical" />
      <span>Members</span>
    </div>
  ),
})
