import { SidebarProvider } from "@enterprise-agentic-saas/ui/components/sidebar"
import { expect } from "storybook/test"

import preview from "#storybook/preview"

import {
  ConsoleFrame,
  ConsoleFrameContent,
  ConsoleFrameHeader,
} from "./console-frame"

const ConsoleFrameExample = () => (
  <SidebarProvider>
    <ConsoleFrame>
      <ConsoleFrameHeader>Acme Cloud · 8 members</ConsoleFrameHeader>
      <ConsoleFrameContent>
        <div className="h-320 rounded-2xl border p-5">
          Scrollable tenant content
        </div>
      </ConsoleFrameContent>
    </ConsoleFrame>
  </SidebarProvider>
)

const meta = preview.meta({
  title: "Web/Console/Console Frame",
  component: ConsoleFrameExample,
  tags: ["autodocs"],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Acme Cloud · 8 members")).toBeVisible()
    await expect(
      canvasElement.querySelector('[data-slot="console-scroll-region"]')
    ).toHaveClass("overflow-y-auto")
  },
})
