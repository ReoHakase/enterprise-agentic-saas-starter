import { useCallback, useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { AgentShortcutHelp } from "./agent-shortcut-help"

const changed = fn()

const OpenShortcutHelp = () => {
  const [open, setOpen] = useState(true)
  const changeOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    changed(nextOpen)
  }, [])
  return <AgentShortcutHelp open={open} onOpenChange={changeOpen} />
}

const meta = preview.meta({
  title: "Web/Agent/Shortcut Help",
  component: OpenShortcutHelp,
  tags: ["autodocs"],
})

export const Open = meta.story({
  tags: ["theme-sensitive"],
  beforeEach() {
    changed.mockClear()
  },
  play: async ({ step }) => {
    const body = within(document.body)

    await step("Review and close the keyboard reference", async () => {
      await waitFor(() =>
        expect(
          body.getByRole("alertdialog", { name: "Agent shortcuts" })
        ).toBeVisible()
      )
      await waitFor(() => expect(body.getByText("⌘/Ctrl Enter")).toBeVisible())
      await userEvent.keyboard("{Escape}")
      await expect(changed).toHaveBeenCalledWith(false)
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", { name: "Agent shortcuts" })
        ).not.toBeInTheDocument()
      )
    })
  },
})
