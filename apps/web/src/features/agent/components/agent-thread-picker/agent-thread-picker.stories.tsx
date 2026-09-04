import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  fictionalAgentThreads,
  fictionalPrimaryAgentThread,
} from "../../test-support/fixtures"
import { AgentThreadItem, AgentThreadToolbar } from "./agent-thread-picker"

const onArchive = fn()
const onCreate = fn()
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
    onSelect,
    selectedThread: fictionalPrimaryAgentThread,
    threads: fictionalAgentThreads,
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("新しい非公開スレッドを作成する", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "New agent thread" })
      )
      await expect(onCreate).toHaveBeenCalledOnce()
    })
  },
})

export const Empty = meta.story({
  args: { selectedThread: undefined, threads: [] },
})

export const Error = meta.story({
  args: { error: true, selectedThread: undefined, threads: [] },
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
    await step("スレッドを選択してアーカイブする", async () => {
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
