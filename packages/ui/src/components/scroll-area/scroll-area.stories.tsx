import { expect } from "storybook/test"

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

const expectLoadedFont = async (element: HTMLElement, family: string) => {
  const document = element.ownerDocument
  const view = document.defaultView
  if (!view) throw new Error("Expected the Storybook iframe window.")

  await expect(view.getComputedStyle(element).fontFamily).toContain(family)

  const loadedFonts = await document.fonts.load(`400 16px "${family}"`)
  await expect(
    loadedFonts.some(
      (font) => font.family === family && font.status === "loaded"
    )
  ).toBe(true)
}

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
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "Recent activity" })
    await expect(list).toBeVisible()
    await expectLoadedFont(list, "Inter Variable")
  },
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
  play: async ({ canvas }) => {
    await expectLoadedFont(
      canvas.getByText(/request_01K1ACME000000000000000000/),
      "Geist Mono Variable"
    )
  },
})
