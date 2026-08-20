import type { IssueWriteToolOutput } from "@enterprise-agentic-saas/agent-contracts"

type PendingActionToolOutput = Extract<
  IssueWriteToolOutput,
  { status: "pending" }
>

export const createPendingActionToolOutput = (
  actionId: string
): PendingActionToolOutput => ({
  actionId,
  expiresAt: "2026-07-26T10:00:00.000Z",
  preview: {
    kind: "update_issue",
    destructive: false,
    attachmentOperation: "add",
    title: "Update Issue #184 priority",
    issueNumber: 184,
    issueRevision: 7,
    fields: [
      {
        field: "priority",
        before: "medium",
        after: "high",
      },
    ],
    attachments: [
      {
        source: "asset",
        assetId: "asset_01K1TENANTPOLICY000000",
        filename: "tenant-policy.png",
        sizeBytes: 2_048,
      },
    ],
  },
  requiresApproval: true,
  status: "pending",
})
