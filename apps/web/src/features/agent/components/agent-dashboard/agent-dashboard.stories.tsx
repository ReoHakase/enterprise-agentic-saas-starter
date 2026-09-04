import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  AgentStoryScope,
  fictionalAgentIdentity,
} from "../../test-support/fixtures"
import { AgentDashboard } from "./agent-dashboard"

const DashboardExample = ({ disabled = false }: { disabled?: boolean }) => (
  <AgentDashboard
    disabled={disabled}
    organizationId={fictionalAgentIdentity.organizationId}
    organizationSlug={fictionalAgentIdentity.organizationSlug}
    presentation="page"
  />
)

const meta = preview.meta({
  title: "Web/Agent/Dashboard",
  component: DashboardExample,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AgentStoryScope>
        <div className="min-h-176">
          <Story />
        </div>
      </AgentStoryScope>
    ),
  ],
})

export const Empty = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("提案プロンプトから新しい会話を準備する", async () => {
      const prompt = await canvas.findByRole("button", {
        name: "Summarize the current page and suggest the next action.",
      })
      await userEvent.click(prompt)
      await expect(
        canvas.getByRole("textbox", { name: "Agent message" })
      ).toHaveTextContent(
        "Summarize the current page and suggest the next action."
      )
    })
  },
})

export const Disabled = meta.story({
  render: () => <DashboardExample disabled />,
})
