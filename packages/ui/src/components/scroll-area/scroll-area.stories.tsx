import preview from "#storybook/preview"

import { ScrollArea, ScrollBar } from "./scroll-area"

const activity = [
  "Avery Stone created issue ENG-1042",
  "Jordan Lee uploaded security-review.pdf",
  "Morgan Chen invited taylor@example.test",
  "Riley Park archived Project Atlas",
  "Casey Kim approved the production deployment",
]

const meta = preview.meta({
  title: "Components/Scroll Area",
  component: ScrollArea,
  tags: ["autodocs"],
})

export const ActivityFeed = meta.story({
  render: () => (
    <ScrollArea className="h-36 w-80 rounded-md border p-4">
      <ul aria-label="Recent activity" className="space-y-4">
        {activity.map((entry) => (
          <li key={`recent-${entry}`} className="text-sm">
            {entry}
          </li>
        ))}
        {activity.map((entry) => (
          <li key={`earlier-${entry}`} className="text-sm">
            {entry}
          </li>
        ))}
      </ul>
    </ScrollArea>
  ),
})

export const HorizontalOverflow = meta.story({
  render: () => (
    <ScrollArea className="w-80 rounded-md border">
      <div className="w-208 p-4 font-mono text-sm">
        request_01K1ACME000000000000000000 · organization_01K1ACME000000
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
})
