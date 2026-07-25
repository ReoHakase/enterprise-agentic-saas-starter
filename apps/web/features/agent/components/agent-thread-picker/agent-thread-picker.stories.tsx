import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import {
  fictionalAgentThreads,
  fictionalPrimaryAgentThread,
} from "../../test-support/fixtures"
import { AgentThreadItem, AgentThreadToolbar } from "./agent-thread-picker"

const onArchive = fn()
const onCreate = fn()
const onRename = fn()
const onSelect = fn()

const meta = preview.meta({
  title: "Web/Agent/Thread Picker",
  component: AgentThreadToolbar,
  tags: ["autodocs"],
  args: {
    archiving: false,
    creating: false,
    disabled: false,
    error: false,
    loading: false,
    onArchive,
    onCreate,
    onRename,
    onSelect,
    renaming: false,
    selectedThread: fictionalPrimaryAgentThread,
    threads: fictionalAgentThreads,
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Rename the selected thread", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Rename thread" })
      )
      const input = canvas.getByRole("textbox", { name: "Thread title" })
      await waitFor(() => expect(input).toHaveFocus())
      await userEvent.clear(input)
      await userEvent.type(input, "Review organization boundary")
      await userEvent.keyboard("{Enter}")
      await expect(onRename).toHaveBeenCalledWith(
        fictionalPrimaryAgentThread,
        "Review organization boundary"
      )
    })

    await step("Create a new private thread", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "New agent thread" })
      )
      await expect(onCreate).toHaveBeenCalledOnce()
    })
  },
})

export const Empty = meta.story({
  args: { selectedThread: undefined, threads: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Create a private thread to start.")
    ).toBeVisible()
    await expect(
      canvas.getByRole("combobox", { name: "Agent thread" })
    ).toBeDisabled()
  },
})

export const Error = meta.story({
  args: { error: true, selectedThread: undefined, threads: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Agent threads could not be loaded."
    )
  },
})

export const ThreadItem = meta.story({
  render: () => (
    <AgentThreadItem
      disabled={false}
      onArchive={onArchive}
      onSelect={onSelect}
      selected
      thread={fictionalPrimaryAgentThread}
    />
  ),
  play: async ({ canvas, step }) => {
    await step("Select and archive the thread", async () => {
      await userEvent.click(
        canvas.getByRole("button", {
          name: fictionalPrimaryAgentThread.title,
        })
      )
      await expect(onSelect).toHaveBeenCalledWith(
        fictionalPrimaryAgentThread.id
      )
      await userEvent.click(
        canvas.getByRole("button", {
          name: `Archive ${fictionalPrimaryAgentThread.title}`,
        })
      )
      await expect(onArchive).toHaveBeenCalledWith(
        fictionalPrimaryAgentThread.id
      )
    })
  },
})
