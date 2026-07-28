import {
  agentCreateIssueActionInputSchema,
  agentDeleteIssueActionInputSchema,
  agentUpdateIssueActionInputSchema,
  type CreateIssueToolInput,
  type DeleteIssueToolInput,
  type UpdateIssueToolInput,
} from "@enterprise-agentic-saas/agent-contracts"

import { parseToolValue } from "../validation"

const normalizeLabels = (labels?: string[]) =>
  labels === undefined
    ? undefined
    : [...new Set(labels.map((label) => label.trim()))]
const normalizeAssignee = (assigneeId?: string | null) =>
  typeof assigneeId === "string" ? assigneeId.trim() || null : assigneeId

export const normalizeCreateIssueToolInput = (input: CreateIssueToolInput) =>
  parseToolValue(agentCreateIssueActionInputSchema, {
    ...input,
    assigneeId: normalizeAssignee(input.assigneeId),
    attachmentAssetIds: [...new Set(input.attachmentAssetIds ?? [])],
    labels: normalizeLabels(input.labels),
    title: input.title.trim(),
  })

export const normalizeUpdateIssueToolInput = (input: UpdateIssueToolInput) => {
  const changedFields = [
    "assigneeId",
    "description",
    "dueDate",
    "labels",
    "priority",
    "status",
    "title",
  ] as const
  if (!changedFields.some((field) => Object.hasOwn(input, field))) {
    throw new Error("Agent tool execution failed")
  }
  return parseToolValue(agentUpdateIssueActionInputSchema, {
    ...input,
    assigneeId: normalizeAssignee(input.assigneeId),
    issueId: input.issueId.trim(),
    labels: normalizeLabels(input.labels),
    title: input.title?.trim(),
  })
}

export const normalizeDeleteIssueToolInput = (input: DeleteIssueToolInput) =>
  parseToolValue(agentDeleteIssueActionInputSchema, {
    ...input,
    issueId: input.issueId.trim(),
  })
