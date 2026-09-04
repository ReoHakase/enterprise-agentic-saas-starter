import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { AGENT_PANE_WIDTH_STORAGE_KEY } from "../../shell-state"
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
  beforeEach: () => {
    window.localStorage.removeItem(AGENT_PANE_WIDTH_STORAGE_KEY)
  },
})

export const Closed = meta.story({
  tags: ["theme-sensitive"],
})

export const ResizeKeyboard = meta.story({
  play: async ({ canvas, step }) => {
    await step("キーボードでペイン幅を変更して保存する", async () => {
      const trigger = canvas.getByRole("button", { name: "Open Agent" })
      await userEvent.click(trigger)
      const pane = canvas.getByRole("complementary", { name: "Agent" })
      const paneCanvas = within(pane)
      const separator = paneCanvas.getByRole("separator", {
        name: "Resize Agent pane",
      })
      separator.focus()
      await userEvent.keyboard("{End}")
      await expect(separator).toHaveAttribute("aria-valuenow", "720")
      await expect(
        window.localStorage.getItem(AGENT_PANE_WIDTH_STORAGE_KEY)
      ).toBe("720")
    })
  },
})

export const CloseInteraction = meta.story({
  play: async ({ canvas, step }) => {
    await step("Agentペインを閉じる", async () => {
      const trigger = canvas.getByRole("button", { name: "Open Agent" })
      await userEvent.click(trigger)
      const pane = canvas.getByRole("complementary", { name: "Agent" })
      const paneCanvas = within(pane)
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

export const MobileFullScreen = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement, step }) => {
    await step("モバイルでAgent sheetを表示領域全体へ表示する", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Open Agent" }))
      const document = canvasElement.ownerDocument
      const dialog = await within(document.body).findByRole("dialog", {
        name: "Agent",
      })
      const rect = dialog.getBoundingClientRect()
      expect(
        Math.abs(rect.width - document.documentElement.clientWidth)
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(rect.height - document.documentElement.clientHeight)
      ).toBeLessThanOrEqual(1)
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Close Agent" })
      )
    })
  },
})

export const MobileCloseFocus = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement, step }) => {
    await step(
      "モバイルでAgent sheetを閉じるとトリガーへフォーカスを戻す",
      async () => {
        const trigger = canvas.getByRole("button", { name: "Open Agent" })
        await userEvent.click(trigger)
        const dialog = await within(
          canvasElement.ownerDocument.body
        ).findByRole("dialog", { name: "Agent" })
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Close Agent" })
        )
        await waitFor(() => expect(dialog).not.toBeInTheDocument())
        await expect(trigger).toHaveFocus()
      }
    )
  },
})
