import type {
  AgentActionExecutionResult,
  AgentCreateIssueActionInput,
  AgentIssueAction,
  AgentIssueActionKind,
  AgentIssueActionPreview,
  AgentUpdateIssueActionInput,
} from "@enterprise-agentic-saas/api/agent-client"
import { tool } from "ai"
import { z } from "zod"

import type { AgentInternalGateway } from "../control-plane/client"
import type { AgentToolBudget } from "./budget"

type AgentWriteApi = Pick<
  AgentInternalGateway,
  | "executeApprovedAction"
  | "prepareCreateIssue"
  | "prepareDeleteIssue"
  | "prepareUpdateIssue"
>

export type AgentWriteControl = {
  holdForApproval: () => void
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const identifierSchema = z.string().trim().regex(IDENTIFIER_PATTERN)
const optionalAssigneeSchema = z
  .union([identifierSchema, z.literal(""), z.null()])
  .optional()
  .describe(
    "Organization member ID. Omit this field or use null when the Issue is unassigned; never use an empty string."
  )
const issueStatusSchema = z.enum(["open", "in_progress", "closed"])
const issuePrioritySchema = z.enum([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
])
const dueDateSchema = z.iso.datetime({ offset: true })
const labelsSchema = z.array(z.string().trim().min(1).max(40)).max(20)
const attachmentAssetIdsSchema = z.array(identifierSchema).max(4).optional()

const mutableIssueFields = {
  assigneeId: optionalAssigneeSchema,
  description: z.string().max(50_000).optional(),
  dueDate: dueDateSchema.nullable().optional(),
  labels: labelsSchema.optional(),
  priority: issuePrioritySchema.optional(),
  status: issueStatusSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
}

const createIssueSchema = z
  .object({
    ...mutableIssueFields,
    attachmentAssetIds: attachmentAssetIdsSchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict()

const updateIssueSchema = z
  .object({
    ...mutableIssueFields,
    expectedRevision: z.number().int().min(1),
    issueId: identifierSchema,
  })
  .strict()
  .refine(
    (input) =>
      [
        "assigneeId",
        "description",
        "dueDate",
        "labels",
        "priority",
        "status",
        "title",
      ].some((field) => Object.hasOwn(input, field)),
    { message: "At least one Issue field must change" }
  )

const deleteIssueSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    issueId: identifierSchema,
  })
  .strict()

export const agentWriteToolSchemas = {
  createIssue: createIssueSchema,
  deleteIssue: deleteIssueSchema,
  updateIssue: updateIssueSchema,
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
  issue: AgentUpdateIssueActionInput
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

export const createActionIdentity = async (
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
  attachments: preview.attachments.slice(0, 4).map((attachment) => ({
    assetId: IDENTIFIER_PATTERN.test(attachment.assetId)
      ? attachment.assetId
      : "invalid",
    filename: bounded(attachment.filename, 200),
    sizeBytes:
      Number.isSafeInteger(attachment.sizeBytes) && attachment.sizeBytes >= 0
        ? attachment.sizeBytes
        : 0,
  })),
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
    typeof result.issue.deleted !== "boolean"
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
): Promise<unknown> => {
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
  ): Promise<unknown> => {
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
    } catch {
      throw new Error("Issue write capability is unavailable")
    }
  }

  return {
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
    deleteIssue: (
      issue: z.output<typeof deleteIssueSchema>,
      toolCallId: string
    ) => {
      const normalizedIssue = { ...issue, issueId: issue.issueId.trim() }
      return invoke("delete_issue", toolCallId, normalizedIssue, (identity) =>
        api.prepareDeleteIssue({
          grant: runGrant,
          issue: normalizedIssue,
          ...identity,
        })
      )
    },
    updateIssue: (issue: AgentUpdateIssueActionInput, toolCallId: string) => {
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

export const createAgentWriteTools = (
  api: AgentWriteApi,
  runGrant: string,
  budget: AgentToolBudget,
  control: AgentWriteControl,
  actionScopeId: string
) => {
  const handlers = createAgentWriteHandlers(
    api,
    runGrant,
    budget,
    control,
    actionScopeId
  )
  return {
    create_issue: tool({
      description:
        "Prepare an Issue creation in the active organization. It may return a canonical preview that requires human approval before execution.",
      execute: (input, options) =>
        handlers.createIssue(input, options.toolCallId),
      inputSchema: createIssueSchema,
      strict: true,
    }),
    delete_issue: tool({
      description:
        "Prepare deletion of one Issue at its expected revision. Deletion requires approval unless an explicit auto-all policy is active.",
      execute: (input, options) =>
        handlers.deleteIssue(input, options.toolCallId),
      inputSchema: deleteIssueSchema,
      strict: true,
    }),
    update_issue: tool({
      description:
        "Prepare an allowlisted Issue field update at its expected revision. It may require human approval.",
      execute: (input, options) =>
        handlers.updateIssue(input, options.toolCallId),
      inputSchema: updateIssueSchema,
      strict: true,
    }),
  }
}
