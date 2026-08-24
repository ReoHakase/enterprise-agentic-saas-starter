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
})
