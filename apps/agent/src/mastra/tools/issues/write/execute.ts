import type {
  AgentActionExecutionResult,
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentIssueAction,
  AgentIssueActionKind,
  AgentIssueActionPreview,
  AgentUpdateIssueActionInput,
  AddIssueAttachmentsToolInput,
  IssueWriteToolOutput,
  RemoveIssueAttachmentsToolInput,
} from "@enterprise-agentic-saas/agent-contracts"

import type { AgentToolBudget } from "../../../core/budget/tool"
import type { AgentControlPlanePort } from "../../../runtime/ports"
import { IDENTIFIER_PATTERN } from "./schema"

type AgentWriteApi = Pick<
  AgentControlPlanePort,
  | "executeApprovedAction"
  | "prepareCreateIssue"
  | "prepareDeleteIssue"
  | "prepareUpdateIssue"
>

export type AgentWriteControl = {
  holdForApproval: () => void
  suspendAction: (actionId: string) => Promise<void>
}

const normalizeLabels = (labels: string[] | undefined): string[] | undefined =>
  labels === undefined
    ? undefined
    : [...new Set(labels.map((label) => label.trim()))]

const normalizeCreateIssue = (
  issue: AgentCreateIssueActionInput
): AgentCreateIssueActionInput => ({
  ...issue,
  assigneeId:
    typeof issue.assigneeId === "string"
      ? issue.assigneeId.trim() || null
      : issue.assigneeId,
  attachmentAssetIds: [...new Set(issue.attachmentAssetIds ?? [])],
  labels: normalizeLabels(issue.labels),
  title: issue.title.trim(),
})

const normalizeUpdateIssue = (
  issue: Extract<AgentUpdateIssueActionInput, { operation?: "fields" }>
): AgentUpdateIssueActionInput => ({
  ...issue,
  assigneeId:
    typeof issue.assigneeId === "string"
      ? issue.assigneeId.trim() || null
      : issue.assigneeId,
  issueId: issue.issueId.trim(),
  labels: normalizeLabels(issue.labels),
  title: issue.title?.trim(),
})

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.entries(value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .filter(([, nested]) => nested !== undefined)
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(",")}}`
}

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

const createActionIdentity = async (
  kind: AgentIssueActionKind,
  providerToolCallId: string,
  payload: unknown,
  actionScopeId = providerToolCallId
): Promise<{ idempotencyKey: string; toolCallId: string }> => {
  const payloadDigest = await sha256(stableJson(payload))
  const identityDigest = await sha256(
    `${kind}\u0000${actionScopeId}\u0000${payloadDigest}`
  )
  const toolCallId = IDENTIFIER_PATTERN.test(providerToolCallId)
    ? providerToolCallId
    : `call_${(await sha256(providerToolCallId)).slice(0, 64)}`

  return { idempotencyKey: `v1.${identityDigest}`, toolCallId }
}

const bounded = (value: string, maximum: number): string =>
  value.length <= maximum ? value : `${value.slice(0, maximum)}…`

const safePreviewValue = (
  value: string | string[] | null
): string | string[] | null =>
  Array.isArray(value)
    ? value.slice(0, 20).map((item) => bounded(item, 200))
    : typeof value === "string"
      ? bounded(value, 2_000)
      : null

const safePreview = (
  preview: AgentIssueActionPreview
): AgentIssueActionPreview => ({
  attachmentOperation: preview.attachmentOperation,
  attachments: preview.attachments
    .slice(0, preview.attachmentOperation === "remove" ? 20 : 4)
    .map((attachment) => {
      const shared = {
        filename: bounded(attachment.filename, 200),
        sizeBytes:
          Number.isSafeInteger(attachment.sizeBytes) &&
          attachment.sizeBytes >= 0
            ? attachment.sizeBytes
            : 0,
      }
      return attachment.source === "asset"
        ? {
            assetId: IDENTIFIER_PATTERN.test(attachment.assetId)
              ? attachment.assetId
              : "invalid",
            filename: shared.filename,
            sizeBytes: shared.sizeBytes,
            source: "asset" as const,
          }
        : {
            fileId: IDENTIFIER_PATTERN.test(attachment.fileId)
              ? attachment.fileId
              : "invalid",
            filename: shared.filename,
            sizeBytes: shared.sizeBytes,
            source: "file" as const,
          }
    }),
  destructive: preview.destructive,
  fields: preview.fields.slice(0, 20).map((field) => ({
    after: safePreviewValue(field.after),
    before: safePreviewValue(field.before),
    field: field.field,
  })),
  issueNumber:
    preview.issueNumber === null ||
    (Number.isSafeInteger(preview.issueNumber) && preview.issueNumber > 0)
      ? preview.issueNumber
      : null,
  issueRevision:
    preview.issueRevision === null ||
    (Number.isSafeInteger(preview.issueRevision) && preview.issueRevision > 0)
      ? preview.issueRevision
      : null,
  kind: preview.kind,
  title: bounded(preview.title, 200),
})

const safeActionId = (value: string): string => {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error("Issue write capability is unavailable")
  }
  return value
}

export const toSafeActionReceipt = (
  result: AgentActionExecutionResult,
  expected: { actionId?: string; kind?: AgentIssueActionKind } = {}
): AgentActionExecutionResult => {
  const expectedActionId = expected.actionId ?? result.actionId
  const expectedKind = expected.kind ?? result.kind
  const mutation = result.issue.attachmentMutation
  const mutationValid =
    mutation === undefined ||
    (result.kind === "update_issue" &&
      result.issue.deleted === false &&
      mutation.fileIds.length >= 1 &&
      mutation.fileIds.length <= (mutation.operation === "added" ? 4 : 20) &&
      new Set(mutation.fileIds).size === mutation.fileIds.length &&
      mutation.fileIds.every((fileId) => IDENTIFIER_PATTERN.test(fileId)))
  if (
    result.status !== "succeeded" ||
    !actionKinds.has(result.kind) ||
    result.actionId !== expectedActionId ||
    result.kind !== expectedKind ||
    !IDENTIFIER_PATTERN.test(result.actionId) ||
    !IDENTIFIER_PATTERN.test(result.issue.id) ||
    !Number.isSafeInteger(result.issue.number) ||
    result.issue.number < 1 ||
    !Number.isSafeInteger(result.issue.revision) ||
    result.issue.revision < 1 ||
    typeof result.issue.deleted !== "boolean" ||
    !mutationValid
  ) {
    throw new Error("Issue write capability is unavailable")
  }
  return {
    actionId: result.actionId,
    issue: {
      deleted: result.issue.deleted,
      id: result.issue.id,
      number: result.issue.number,
      revision: result.issue.revision,
      ...(mutation ? { attachmentMutation: mutation } : {}),
    },
    kind: result.kind,
    status: "succeeded",
  }
}

const actionStatuses = new Set([
  "pending",
  "approved",
  "rejected",
  "expired",
  "canceled",
  "succeeded",
  "conflicted",
])
const actionKinds = new Set<AgentIssueActionKind>([
  "create_issue",
  "delete_issue",
  "update_issue",
])

const prepareResult = async (
  api: AgentWriteApi,
  runGrant: string,
  kind: AgentIssueActionKind,
  actionPromise: Promise<AgentIssueAction>,
  budget: AgentToolBudget,
  control: AgentWriteControl
): Promise<IssueWriteToolOutput> => {
  const action = await actionPromise
  const actionId = safeActionId(action.id)
  if (action.kind !== kind || !actionStatuses.has(action.status)) {
    throw new Error("Issue write capability is unavailable")
  }

  if (action.status === "pending") {
    if (
      !action.requiresApproval ||
      action.preview === null ||
      action.preview.kind !== kind
    ) {
      throw new Error("Issue write capability is unavailable")
    }
    const preview = safePreview(action.preview)
    const expiresAt = bounded(action.expiresAt, 64)
    await control.suspendAction(actionId)
    control.holdForApproval()
    budget.suspendForApproval()
    return {
      actionId,
      expiresAt,
      preview,
      requiresApproval: true,
      status: "pending" as const,
    }
  }

  if (action.status === "approved" || action.status === "succeeded") {
    return toSafeActionReceipt(
      await api.executeApprovedAction({ actionId, grant: runGrant }),
      { actionId, kind }
    )
  }

  return {
    actionId,
    requiresApproval: false,
    status: action.status,
  }
}

export const createAgentWriteHandlers = (
  api: AgentWriteApi,
  runGrant: string,
  budget: AgentToolBudget,
  control: AgentWriteControl,
  actionScopeId: string
) => {
  const invoke = async (
    kind: AgentIssueActionKind,
    providerToolCallId: string,
    payload: unknown,
    prepare: (identity: {
      idempotencyKey: string
      toolCallId: string
    }) => Promise<AgentIssueAction>
  ): Promise<IssueWriteToolOutput> => {
    budget.consume("write")
    try {
      const identity = await createActionIdentity(
        kind,
        providerToolCallId,
        payload,
        actionScopeId
      )
      return await prepareResult(
        api,
        runGrant,
        kind,
        prepare(identity),
        budget,
        control
      )
    } catch (cause) {
      throw new Error("Issue write capability is unavailable", { cause })
    }
  }

  return {
    addIssueAttachments: (
      input: AddIssueAttachmentsToolInput,
      toolCallId: string
    ) => {
      const normalizedIssue: AgentUpdateIssueActionInput = {
        operation: "add_attachments",
        issueId: input.issueId.trim(),
        expectedRevision: input.expectedRevision,
        attachmentAssetIds: [...new Set(input.assetIds)],
      }
      return invoke("update_issue", toolCallId, normalizedIssue, (identity) =>
        api.prepareUpdateIssue({
          grant: runGrant,
          issue: normalizedIssue,
          ...identity,
        })
      )
    },
    createIssue: (issue: AgentCreateIssueActionInput, toolCallId: string) => {
      const normalizedIssue = normalizeCreateIssue(issue)
      return invoke("create_issue", toolCallId, normalizedIssue, (identity) =>
        api.prepareCreateIssue({
          grant: runGrant,
          issue: normalizedIssue,
          ...identity,
        })
      )
    },
    deleteIssue: (issue: AgentDeleteIssueActionInput, toolCallId: string) => {
      const normalizedIssue = { ...issue, issueId: issue.issueId.trim() }
      return invoke("delete_issue", toolCallId, normalizedIssue, (identity) =>
        api.prepareDeleteIssue({
          grant: runGrant,
          issue: normalizedIssue,
          ...identity,
        })
      )
    },
    removeIssueAttachments: (
      input: RemoveIssueAttachmentsToolInput,
      toolCallId: string
    ) => {
      const normalizedIssue: AgentUpdateIssueActionInput = {
        operation: "remove_attachments",
        issueId: input.issueId.trim(),
        expectedRevision: input.expectedRevision,
        attachmentFileIds: [...new Set(input.fileIds)],
      }
      return invoke("update_issue", toolCallId, normalizedIssue, (identity) =>
        api.prepareUpdateIssue({
          grant: runGrant,
          issue: normalizedIssue,
          ...identity,
        })
      )
    },
    updateIssue: (
      issue: Extract<AgentUpdateIssueActionInput, { operation?: "fields" }>,
      toolCallId: string
    ) => {
      const normalizedIssue = normalizeUpdateIssue(issue)
      return invoke("update_issue", toolCallId, normalizedIssue, (identity) =>
        api.prepareUpdateIssue({
          grant: runGrant,
          issue: normalizedIssue,
          ...identity,
        })
      )
    },
  }
}
