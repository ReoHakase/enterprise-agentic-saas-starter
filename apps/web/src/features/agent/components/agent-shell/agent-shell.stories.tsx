import { expect, userEvent, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  AgentStoryScope,
  fictionalAgentIdentity,
} from "../../test-support/fixtures"
import { AgentShell, AgentShellTrigger } from "./agent-shell"

const shellOrganization = {
  id: fictionalAgentIdentity.organizationId,
  name: "Acme Cloud",
  slug: fictionalAgentIdentity.organizationSlug,
}

const ShellExample = () => (
  <AgentStoryScope>
    <div className="flex min-h-176">
      <AgentShellTrigger />
      <AgentShell
        contextMismatch={false}
        organization={shellOrganization}
        userId={fictionalAgentIdentity.userId}
      />
    </div>
  </AgentStoryScope>
)

const meta = preview.meta({
  title: "Web/Agent/Shell",
  component: ShellExample,
  tags: ["autodocs"],
})

export const Closed = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Open, resize, and close the persistent pane", async () => {
      const trigger = canvas.getByRole("button", { name: "Open Agent" })
      await userEvent.click(trigger)
      const pane = canvas.getByRole("complementary", { name: "Agent" })
      await expect(pane).toBeVisible()
      const paneCanvas = within(pane)
      const separator = paneCanvas.getByRole("separator", {
        name: "Resize Agent pane",
      })
      separator.focus()
      await userEvent.keyboard("{End}")
      await expect(separator).toHaveAttribute("aria-valuenow", "720")
      await userEvent.click(
        paneCanvas.getByRole("button", { name: "Close Agent" })
      )
      await expect(
        canvas.queryByRole("complementary", { name: "Agent" })
      ).not.toBeInTheDocument()
      await expect(trigger).toHaveAccessibleName("Open Agent")
    })
  },
})
