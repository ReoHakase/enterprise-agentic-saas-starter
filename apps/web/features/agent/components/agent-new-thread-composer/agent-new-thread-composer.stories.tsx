import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  AgentStoryScope,
  fictionalAgentIdentity,
} from "../../test-support/fixtures"
import { AgentNewThreadComposer } from "./agent-new-thread-composer"

const createThread = fn()

const meta = preview.meta({
  title: "Web/Agent/New Thread Composer",
  component: AgentNewThreadComposer,
  tags: ["autodocs"],
  args: {
    creating: false,
    disabled: false,
    onCreate: createThread,
    organizationId: fictionalAgentIdentity.organizationId,
  },
  decorators: [
    (Story) => (
      <AgentStoryScope>
        <div className="flex min-h-160 max-w-3xl">
          <Story />
        </div>
      </AgentStoryScope>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Start from a realistic suggested prompt", async () => {
      await userEvent.click(
        canvas.getByRole("button", {
          name: "Summarize the current page and suggest the next action.",
        })
      )
      await expect(
        await canvas.findByRole("textbox", { name: "Agent message" })
      ).toHaveTextContent(
        "Summarize the current page and suggest the next action."
      )
      await userEvent.click(canvas.getByRole("button", { name: "Send" }))
      await expect(createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          autoSubmit: true,
          composer: "Summarize the current page and suggest the next action.",
          permissionMode: "ask_always",
        })
      )
    })
  },
})

export const Creating = meta.story({
  args: { creating: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /starting/i })
    ).toBeDisabled()
    await expect(
      await canvas.findByRole("textbox", { name: "Agent message" })
    ).toHaveAttribute("contenteditable", "false")
  },
})
