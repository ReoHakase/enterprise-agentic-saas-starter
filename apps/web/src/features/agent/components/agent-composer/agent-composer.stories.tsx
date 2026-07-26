import { useCallback, useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  AgentStoryScope,
  fictionalMentionCandidates,
} from "../../test-support/fixtures"
import { AgentComposer } from "./agent-composer"

const draftChanged = fn()
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
    await step("Enter a message with the keyboard", async () => {
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
  play: async ({ canvas, step }) => {
    const body = within(document.body)

    await step("Choose an Issue mention with the keyboard", async () => {
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

export const Disabled = meta.story({
  args: { disabled: true, initialDraft: "Pending approval cannot be edited." },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("textbox", { name: "Agent message" })
    ).toHaveAttribute("contenteditable", "false")
  },
})
