import { useCallback, useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  AgentStoryScope,
  fictionalMentionCandidates,
} from "../../test-support/fixtures"
import { AgentComposer } from "./agent-composer"

const draftChanged = fn()
const submitted = fn()
const mentionCandidates = [...fictionalMentionCandidates]

const ControlledComposer = ({
  disabled = false,
  initialDraft = "",
}: {
  disabled?: boolean
  initialDraft?: string
}) => {
  const [draft, setDraft] = useState(initialDraft)
  const changeDraft = useCallback((value: string) => {
    setDraft(value)
    draftChanged(value)
  }, [])
  return (
    <AgentComposer
      candidates={mentionCandidates}
      disabled={disabled}
      draftText={draft}
      onDraftTextChange={changeDraft}
      onSubmit={submitted}
    />
  )
}

const meta = preview.meta({
  title: "Web/Agent/Composer",
  component: ControlledComposer,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AgentStoryScope>
        <Story />
      </AgentStoryScope>
    ),
  ],
})

export const Empty = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("キーボードでメッセージを入力する", async () => {
      const editor = await canvas.findByRole("textbox", {
        name: "Agent message",
      })
      await userEvent.click(editor)
      await userEvent.type(editor, "Summarize the active Issue.")
      await expect(editor).toHaveFocus()
      await expect(draftChanged).toHaveBeenLastCalledWith(
        "Summarize the active Issue."
      )
    })
  },
})

export const Mention = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("キーボードでIssueメンションを選ぶ", async () => {
      const editor = await canvas.findByRole("textbox", {
        name: "Agent message",
      })
      await userEvent.click(editor)
      await userEvent.type(editor, "@tenant")
      await expect(
        body.getByRole("button", {
          name: /Issue #184: Review tenant access/i,
        })
      ).toBeVisible()
      await userEvent.keyboard("{Enter}")
      await expect(
        canvas.getByRole("button", {
          name: "Remove Issue #184: Review tenant access",
        })
      ).toBeVisible()
    })
  },
})

export const KeyboardSubmission = meta.story({
  play: async ({ canvas, step }) => {
    await step("Shift+Enterで改行しEnterで送信する", async () => {
      const editor = await canvas.findByRole("textbox", {
        name: "Agent message",
      })
      await userEvent.click(editor)
      await userEvent.type(editor, "First line")
      await userEvent.keyboard("{Shift>}{Enter}{/Shift}")
      await userEvent.type(editor, "Second line")
      await expect(draftChanged).toHaveBeenLastCalledWith(
        "First line\nSecond line"
      )
      await expect(submitted).not.toHaveBeenCalled()

      await userEvent.keyboard("{Enter}")
      await expect(submitted).toHaveBeenCalledOnce()
    })
  },
})

export const Disabled = meta.story({
  args: { disabled: true, initialDraft: "Pending approval cannot be edited." },
})
