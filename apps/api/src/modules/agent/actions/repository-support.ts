import type {
  agentActions,
  IssuePriority,
  IssueStatus,
} from "@enterprise-agentic-saas/db/schema"
import * as v from "valibot"

import type {
  AgentActionExecutionResult,
  AgentIssueAction,
} from "../../../agent-client"
import { HttpError } from "../../../errors/http-error"
import { agentIssueActionPreviewModel } from "../action-schema"
import { hashAgentToken } from "../crypto"

export const ACTION_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const ACTION_RESUME_RUN_TTL_MS = 5 * 60 * 1000
export const MAX_ROOT_WRITE_ACTIONS = 5

export type ActionRow = typeof agentActions.$inferSelect

type StoredAttachment = {
  assetId: string
  fileId: string
}

export type StoredCreateIssuePayload = {
  requestFingerprint: string
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  labels: string[]
  dueDate: string | null
  attachments: StoredAttachment[]
}

type StoredIssueFieldChanges = {
  title?: string
  description?: string
  status?: IssueStatus
  priority?: IssuePriority
  assigneeId?: string | null
  labels?: string[]
  dueDate?: string | null
}
export type StoredUpdateIssuePayload =
  | {
      operation: "fields"
      requestFingerprint: string
      issueId: string
      expectedRevision: number
      changes: StoredIssueFieldChanges
    }
  | {
      operation: "add_attachments"
      requestFingerprint: string
      issueId: string
      expectedRevision: number
      attachments: StoredAttachment[]
    }
  | {
      operation: "remove_attachments"
      requestFingerprint: string
      issueId: string
      expectedRevision: number
      fileIds: string[]
    }

export type StoredDeleteIssuePayload = {
  requestFingerprint: string
  issueId: string
  expectedRevision: number
}

export type StoredPayload =
  | { kind: "create_issue"; value: StoredCreateIssuePayload }
  | { kind: "update_issue"; value: StoredUpdateIssuePayload }
  | { kind: "delete_issue"; value: StoredDeleteIssuePayload }

export type PrepareInput = {
  grant: string
  toolCallId: string
  idempotencyKey: string
  now?: Date
}

const storedAttachmentModel = v.strictObject({
  assetId: v.string(),
  fileId: v.string(),
})

const requestFingerprintModel = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))

export const storedCreateIssuePayloadModel = v.strictObject({
  requestFingerprint: requestFingerprintModel,
  title: v.string(),
  description: v.string(),
  status: v.picklist(["open", "in_progress", "closed"]),
  priority: v.picklist(["no_priority", "low", "medium", "high", "urgent"]),
  assigneeId: v.nullable(v.string()),
  labels: v.array(v.string()),
  dueDate: v.nullable(v.string()),
  attachments: v.array(storedAttachmentModel),
})

export const storedUpdateIssuePayloadModel = v.variant("operation", [
  v.strictObject({
    operation: v.literal("fields"),
    requestFingerprint: requestFingerprintModel,
    issueId: v.string(),
    expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    changes: v.strictObject({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      status: v.optional(v.picklist(["open", "in_progress", "closed"])),
      priority: v.optional(
        v.picklist(["no_priority", "low", "medium", "high", "urgent"])
      ),
      assigneeId: v.optional(v.nullable(v.string())),
      labels: v.optional(v.array(v.string())),
      dueDate: v.optional(v.nullable(v.string())),
    }),
  }),
  v.strictObject({
    operation: v.literal("add_attachments"),
    requestFingerprint: requestFingerprintModel,
    issueId: v.string(),
    expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    attachments: v.pipe(
      v.array(storedAttachmentModel),
      v.minLength(1),
      v.maxLength(4)
    ),
  }),
  v.strictObject({
    operation: v.literal("remove_attachments"),
    requestFingerprint: requestFingerprintModel,
    issueId: v.string(),
    expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    fileIds: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(20)),
  }),
])

export const normalizeStoredUpdateIssuePayload = (input: unknown) =>
  input &&
  typeof input === "object" &&
  !Array.isArray(input) &&
  !Object.hasOwn(input, "operation")
    ? { operation: "fields", ...input }
    : input

export const storedDeleteIssuePayloadModel = v.strictObject({
  requestFingerprint: requestFingerprintModel,
  issueId: v.string(),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

const addedReceiptFileIdsModel = v.pipe(
  v.array(v.string()),
  v.minLength(1),
  v.maxLength(4),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const removedReceiptFileIdsModel = v.pipe(
  v.array(v.string()),
  v.minLength(1),
  v.maxLength(20),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const storedAttachmentMutationModel = v.variant("operation", [
  v.strictObject({
    operation: v.literal("added"),
    fileIds: addedReceiptFileIdsModel,
  }),
  v.strictObject({
    operation: v.literal("removed"),
    fileIds: removedReceiptFileIdsModel,
  }),
])

const storedReceiptModel = v.strictObject({
  issueId: v.string(),
  number: v.pipe(v.number(), v.integer(), v.minValue(1)),
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  deleted: v.boolean(),
  attachmentMutation: v.optional(storedAttachmentMutationModel),
})

const databaseDiagnostic = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  return messages.join(" ")
}

const isPrepareIdempotencyRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    diagnostic.includes("agent_actions_idempotency_uidx") ||
    diagnostic.includes(
      "agent_actions.organization_id, agent_actions.idempotency_key"
    )
  )
}

export const isPrepareRetryableRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    isPrepareIdempotencyRace(cause) ||
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED")
  )
}

export const isActiveAssetLeaseConflict = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    diagnostic.includes("agent_action_assets_active_asset_uidx") ||
    diagnostic.includes(
      "UNIQUE constraint failed: agent_action_assets.asset_id"
    )
  )
}

const isDecisionIdempotencyRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    diagnostic.includes("agent_actions_decision_idempotency_uidx") ||
    diagnostic.includes(
      "agent_actions.organization_id, agent_actions.decision_idempotency_key"
    )
  )
}

export class AgentActionWriteRaceError extends Error {}

const agentActionQueues = new Map<string, Promise<void>>()
const releaseAgentActionQueue = () => {}

export const withAgentActionLock = async <T>(
  actionId: string,
  operation: () => Promise<T>
) => {
  const previous = agentActionQueues.get(actionId) ?? Promise.resolve()
  let release = releaseAgentActionQueue
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  agentActionQueues.set(actionId, queued)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (agentActionQueues.get(actionId) === queued) {
      agentActionQueues.delete(actionId)
    }
  }
}

export const withAgentPrepareLock = async <T>(
  grant: string,
  operation: () => Promise<T>
) => withAgentActionLock(`prepare:${await hashAgentToken(grant)}`, operation)

export const isActionWriteRetryableRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    cause instanceof AgentActionWriteRaceError ||
    isDecisionIdempotencyRace(cause) ||
    diagnostic.includes("issues_organization_number_uidx") ||
    diagnostic.includes("issues.organization_id, issues.number") ||
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED")
  )
}

const canonicalJson = (value: unknown): string => {
  if (value === undefined) return "undefined"
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  return `{${Object.keys(value)
    .toSorted()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`
    )
    .join(",")}}`
}

export const actionRequestFingerprint = async (value: unknown) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value))
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export const safeStoredParse = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, input)
  if (!result.success) throw new Error("Stored agent action is invalid")
  return result.output
}

const normalizeLegacyPreview = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  const attachments = Reflect.get(input, "attachments")
  return {
    ...input,
    attachmentOperation: Reflect.get(input, "attachmentOperation") ?? null,
    attachments: Array.isArray(attachments)
      ? attachments.map((attachment) => {
          if (
            !attachment ||
            typeof attachment !== "object" ||
            Array.isArray(attachment) ||
            Object.hasOwn(attachment, "source")
          ) {
            return attachment
          }
          if (typeof Reflect.get(attachment, "assetId") === "string") {
            return { source: "asset", ...attachment }
          }
          if (typeof Reflect.get(attachment, "fileId") === "string") {
            return { source: "file", ...attachment }
          }
          return attachment
        })
      : attachments,
  }
}

export const toActionDto = (action: ActionRow): AgentIssueAction => {
  const preview =
    action.canonicalPreview === null
      ? null
      : safeStoredParse(
          agentIssueActionPreviewModel,
          normalizeLegacyPreview(action.canonicalPreview)
        )
  return {
    id: action.id,
    kind: action.kind,
    status: action.status,
    approvalMode:
      action.decisionProvenance === "auto_policy"
        ? "full_access"
        : action.decisionProvenance,
    requiresApproval: action.status === "pending",
    preview,
    previewState: preview === null ? "expired" : "available",
    expiresAt: action.expiresAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null,
  }
}

export const executionResult = (
  action: ActionRow,
  receiptValue: unknown
): AgentActionExecutionResult => {
  const receipt = safeStoredParse(storedReceiptModel, receiptValue)
  return {
    actionId: action.id,
    kind: action.kind,
    status: "succeeded",
    issue: {
      id: receipt.issueId,
      number: receipt.number,
      revision: receipt.revision,
      deleted: receipt.deleted,
      ...(receipt.attachmentMutation
        ? { attachmentMutation: receipt.attachmentMutation }
        : {}),
    },
  }
}

export const normalizeDueDate = (value: string | null | undefined) => {
  if (value === undefined || value === null) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new HttpError({ code: "validation_error" })
  }
  return date.toISOString()
}

export const parseDueDate = (value: string | null | undefined) =>
  value === undefined || value === null ? value : new Date(value)
