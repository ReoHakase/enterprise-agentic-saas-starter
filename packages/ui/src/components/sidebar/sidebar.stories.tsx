import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { SidebarStoryFixture } from "./test-support/sidebar-story-fixture"

const meta = preview.meta({
  title: "Components/Sidebar",
  component: SidebarStoryFixture,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
})

export const ExpandedAndCollapsed = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvasElement, step }) => {
    const sidebar = canvasElement.querySelector(
      '[data-slot="sidebar"][data-state]'
    )
    if (!sidebar) throw new Error("Sidebar state container was not rendered")
    await step("Ctrl+Bで折りたたみ状態を切り替える", async () => {
      await expect(sidebar).toHaveAttribute("data-state", "expanded")
      await userEvent.keyboard("{Control>}b{/Control}")
      await expect(sidebar).toHaveAttribute("data-state", "collapsed")
      await userEvent.keyboard("{Control>}b{/Control}")
      await expect(sidebar).toHaveAttribute("data-state", "expanded")
    })
  },
})

export const IconMode = meta.story({
  render: () => <SidebarStoryFixture defaultOpen={false} />,
})
