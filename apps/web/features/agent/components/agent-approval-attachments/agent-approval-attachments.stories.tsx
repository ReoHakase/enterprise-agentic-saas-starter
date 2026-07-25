import { expect } from "storybook/test"

import preview from "#storybook/preview"

import {
  fictionalAgentIdentity,
  fictionalPendingAction,
} from "../../test-support/fixtures"
import { AgentApprovalAttachments } from "./agent-approval-attachments"

const meta = preview.meta({
  title: "Web/Agent/Approval Attachments",
  component: AgentApprovalAttachments,
  tags: ["autodocs"],
  args: {
    attachments: fictionalPendingAction.preview?.attachments ?? [],
    organizationId: fictionalAgentIdentity.organizationId,
  },
})

export const PrivatePreview = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Explain attachment permanence before approval", async () => {
      await expect(
        canvas.getByRole("region", {
          name: "Issue attachments awaiting approval",
        })
      ).toHaveTextContent("will become permanent Issue attachments")
      await expect(
        canvas.getByRole("img", {
          name: "Attachment preview: tenant-policy.png",
        })
      ).toBeVisible()
      await expect(canvas.getByText("2 KB")).toBeVisible()
    })
  },
})
