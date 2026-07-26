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
    await expect(canvas.getByRole("alert", { name: "Overview" })).toBeVisible()
    await expect(
      canvas.getByText("The workspace is temporarily unavailable")
    ).toBeVisible()
    await step("Move focus from the error heading to recovery", async () => {
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
      await expect(reset).not.toHaveBeenCalled()
    })
  },
})

export const Shell = meta.story({
  render: () => <ConsoleShellError reset={reset} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toBeVisible()
  },
})
