import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import { ConsoleContentError, ConsoleShellError } from "./view"

const reset = fn()

const meta = preview.meta({
  title: "Web/Console/Console Errors",
  component: ConsoleContentError,
  tags: ["autodocs"],
  args: { reset },
})

export const Content = meta.story({
  tags: ["theme-sensitive"],
  beforeEach() {
    reset.mockClear()
  },
  play: async ({ canvas, step }) => {
    await step("エラー見出しから再試行操作へフォーカスを移す", async () => {
      await waitFor(() =>
        expect(
          canvas.getByRole("heading", {
            name: "Overview",
          })
        ).toHaveFocus()
      )
      await userEvent.tab()
      await expect(
        canvas.getByRole("button", { name: "Try again" })
      ).toHaveFocus()
    })
  },
})

export const Shell = meta.story({
  render: () => <ConsoleShellError reset={reset} />,
})
