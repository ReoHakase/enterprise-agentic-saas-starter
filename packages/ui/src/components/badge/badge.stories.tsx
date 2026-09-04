import preview from "#storybook/preview"

import { Badge } from "./badge"

const meta = preview.meta({
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
})

export const Statuses = meta.story({
  tags: ["theme-sensitive"],
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Active</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="outline">Invited</Badge>
      <Badge variant="destructive">Payment failed</Badge>
    </div>
  ),
})

export const LongStatus = meta.story({
  args: {
    children: "Awaiting approval from Acme Cloud administrators",
    variant: "outline",
  },
})
