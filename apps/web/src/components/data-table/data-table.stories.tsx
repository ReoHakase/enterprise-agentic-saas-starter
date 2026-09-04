import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { DataTableStoryFixture } from "@/test-support/data-table-story-fixture"

const meta = preview.meta({
  title: "Web/Shared/Data Table",
  component: DataTableStoryFixture,
  tags: ["autodocs"],
})

export const Default = meta.story({})

export const InteractiveCells = meta.story({
  args: { interactive: true, selectable: true },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    await step("状態選択を閉じるとトリガーへフォーカスを戻す", async () => {
      const link = canvas.getByRole("link", { name: "Billing webhook" })
      link.focus()
      await userEvent.keyboard("{Tab}{Enter}")
      const select = canvas.getByRole("combobox", {
        name: "Status for Billing webhook",
      })
      await expect(
        await ownerBody.findByRole("option", { name: "Ready" })
      ).toBeVisible()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(select).toHaveFocus())
    })
  },
})

export const RowActionsKeyboard = meta.story({
  args: { interactive: true, selectable: true },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    await step("行操作を閉じるとトリガーへフォーカスを戻す", async () => {
      const actions = canvas.getByRole("button", {
        name: "Actions for Billing webhook",
      })
      actions.focus()
      await userEvent.keyboard("{Enter}")
      const menu = await ownerBody.findByRole("menu")
      await waitFor(() => expect(menu).toBeVisible())
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(actions).toHaveFocus())
    })
  },
})

export const Selectable = meta.story({
  args: { selectable: true },
})

export const HorizontalOverflow = meta.story({
  args: { wide: true, interactive: true },
})

export const Mobile = meta.story({
  args: { selectable: true, interactive: true, wide: true },
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
})
