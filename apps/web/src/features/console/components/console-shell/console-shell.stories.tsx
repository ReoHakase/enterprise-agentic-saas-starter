import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import { fictionalMe } from "@/features/account/test-support/fixtures"

import { ConsoleShell } from "./console-shell"

const meta = preview.meta({
  title: "Web/Console/Console Shell",
  component: ConsoleShell,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <Story />
      </Providers>
    ),
  ],
  args: {
    me: fictionalMe,
    children: (
      <section aria-labelledby="story-dashboard-heading">
        <h1 id="story-dashboard-heading">Dashboard</h1>
        <p>Review tenant activity and open work.</p>
      </section>
    ),
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement, step }) => {
    await step("Toggle the responsive application navigation", async () => {
      await expect(
        canvas.getByRole("heading", { name: "Dashboard" })
      ).toBeVisible()
      const trigger = canvasElement.querySelector<HTMLButtonElement>(
        'button[data-sidebar="trigger"]'
      )
      await expect(trigger).toBeVisible()
      if (!trigger) throw new Error("Sidebar trigger was not rendered")
      await userEvent.click(trigger)
      await expect(trigger).toHaveFocus()
    })
  },
})

export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLButtonElement>(
      'button[data-sidebar="trigger"]'
    )
    await expect(trigger).toBeVisible()
  },
})
