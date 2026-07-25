import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentMessages,
  agentThreadContextSummaries,
  type agentThreads,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq } from "drizzle-orm"
import * as v from "valibot"

import type {
  AgentCanonicalMessage,
  AgentIssue,
  AgentIssueAttachment,
  AgentOrganizationContext,
} from "../../../agent-client"
import { AppError, publicErrors } from "../../../errors/app-error"
import { normalizeOrganizationRole } from "../../authorization/public"
import { type FileDto } from "../../files/public"
import { type IssueDto } from "../../issues/public"
import { agentCanonicalMessageModel } from "../model"
export * from "./domain"

export type AgentTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export type AgentThreadDto = {
  id: string
  title: string
  titleRevision: number
  status: "active" | "archived"
  messageCount: number
  createdAt: string
  updatedAt: string
}

export const CONNECTION_TICKET_TTL_MS = 60_000
export const AGENT_RUN_TTL_MS = 5 * 60_000
const MODEL_HISTORY_MESSAGE_LIMIT = 200
const MODEL_HISTORY_CHARACTER_LIMIT = 4_000_000
const MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION = 12
const MODEL_CONTEXT_COMPACTION_TOKEN_THRESHOLD = 950_000
export const UI_HISTORY_MESSAGE_LIMIT = 40
export const UI_HISTORY_CHARACTER_LIMIT = 1_000_000

export const clientToolNames = new Set([
  "ui_navigate",
  "ui_open_issue",
  "ui_patch_form_draft",
  "ui_read_form_draft",
  "ui_set_issue_query",
])

export const toThreadDto = (
  thread: typeof agentThreads.$inferSelect,
  messageCount: number
): AgentThreadDto => ({
  id: thread.id,
  title: thread.title,
  titleRevision: thread.titleRevision,
  status: thread.status,
  messageCount,
  createdAt: thread.createdAt.toISOString(),
  updatedAt: thread.updatedAt.toISOString(),
})

const toCanonicalMessage = (
  message: typeof agentMessages.$inferSelect
): AgentCanonicalMessage =>
  v.parse(agentCanonicalMessageModel, {
    id: message.clientMessageId ?? message.id,
    role: message.role,
    parts: message.content.parts,
  })

export const parseCanonicalMessage = <
  Role extends AgentCanonicalMessage["role"],
>(
  message: unknown,
  role: Role
): AgentCanonicalMessage & { role: Role } => {
  const parsed = v.safeParse(agentCanonicalMessageModel, message)
  if (!parsed.success || !canonicalMessageHasRole(parsed.output, role)) {
    throw publicErrors.validation("Invalid agent message")
  }
  return parsed.output
}

const canonicalMessageHasRole = <Role extends AgentCanonicalMessage["role"]>(
  message: AgentCanonicalMessage,
  role: Role
): message is AgentCanonicalMessage & { role: Role } => message.role === role

const boundedCanonicalMessages = (
  messages: AgentCanonicalMessage[],
  characterLimit: number
): AgentCanonicalMessage[] => {
  const selected: AgentCanonicalMessage[] = []
  let characters = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    const size = JSON.stringify(message).length
    if (selected.length > 0 && characters + size > characterLimit) break
    selected.push(message)
    characters += size
  }
  return selected.toReversed()
}

export const listCanonicalMessagesInTransaction = async (
  tx: AgentTransaction,
  input: {
    organizationId: string
    threadId: string
    messageLimit: number
    characterLimit: number
  }
): Promise<AgentCanonicalMessage[]> => {
  const rows = await tx
    .select()
    .from(agentMessages)
    .where(
      and(
        eq(agentMessages.organizationId, input.organizationId),
        eq(agentMessages.threadId, input.threadId)
      )
    )
    .orderBy(desc(agentMessages.sequence))
    .limit(input.messageLimit)
  return boundedCanonicalMessages(
    rows.toReversed().map(toCanonicalMessage),
    input.characterLimit
  )
}

const compactedMessageLine = (
  message: typeof agentMessages.$inferSelect
): string => {
  const parts = toCanonicalMessage(message)
    .parts.map((part) => {
      if (part.type === "text" || part.type === "reasoning") return part.text
      if (part.type.startsWith("tool-")) {
        return `${part.type}: ${JSON.stringify("output" in part ? part.output : undefined)}`
      }
      return ""
    })
    .filter(Boolean)
    .join(" ")
  return `${message.role}: ${parts}`.slice(0, 4_000)
}

export const listModelContextInTransaction = async (
  tx: AgentTransaction,
  input: { organizationId: string; threadId: string }
): Promise<AgentCanonicalMessage[]> => {
  const rows = await tx
    .select()
    .from(agentMessages)
    .where(
      and(
        eq(agentMessages.organizationId, input.organizationId),
        eq(agentMessages.threadId, input.threadId)
      )
    )
    .orderBy(desc(agentMessages.sequence))
    .limit(MODEL_HISTORY_MESSAGE_LIMIT)
  const ordered = rows.toReversed()
  const estimatedTokens = Math.ceil(JSON.stringify(ordered).length / 4)
  if (
    estimatedTokens < MODEL_CONTEXT_COMPACTION_TOKEN_THRESHOLD ||
    ordered.length <= MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION
  ) {
    return boundedCanonicalMessages(
      ordered.map(toCanonicalMessage),
      MODEL_HISTORY_CHARACTER_LIMIT
    )
  }

  const compacted = ordered.slice(
    0,
    -MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION
  )
  const recent = ordered.slice(-MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION)
  const throughSequence = compacted.at(-1)?.sequence
  if (!throughSequence) return recent.map(toCanonicalMessage)
  const summary =
    compacted.map(compactedMessageLine).join("\n").slice(0, 50_000) ||
    "Earlier messages contained only structured activity."
  const summaryId = `summary_${input.threadId}_${throughSequence}`.slice(0, 128)
  await tx
    .insert(agentThreadContextSummaries)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      threadId: input.threadId,
      throughSequence,
      summary,
      estimatedTokenCount: Math.max(1, Math.ceil(summary.length / 4)),
      model: "qwen/qwen3.6-flash",
    })
    .onConflictDoNothing()
  return [
    {
      id: summaryId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `Earlier conversation summary (through message ${throughSequence}):\n${summary}`,
        },
      ],
    },
    ...recent.map(toCanonicalMessage),
  ]
}

export const toAgentIssue = (issue: IssueDto): AgentIssue => ({
  id: issue.id,
  number: issue.number,
  title: issue.title,
  description: issue.description,
  status: issue.status,
  priority: issue.priority,
  assigneeId: issue.assigneeId,
  labels: issue.labels,
  dueDate: issue.dueDate,
  revision: issue.revision,
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
})

export const toAgentIssueAttachment = (
  file: FileDto
): AgentIssueAttachment => ({
  id: file.id,
  filename: file.filename,
  sizeBytes: file.sizeBytes,
  declaredContentType: file.declaredContentType,
  imageReadable: file.previewable,
  textPreviewable: file.textPreviewable,
  dimensions:
    file.imageWidth !== null && file.imageHeight !== null
      ? { width: file.imageWidth, height: file.imageHeight }
      : null,
  uploaderName: file.uploader.name,
  createdAt: file.createdAt,
})

const permissionsForAgent = (
  role: ReturnType<typeof normalizeOrganizationRole>
): AgentOrganizationContext["permissions"] => ({
  canReadIssues: true,
  canCreateIssues: true,
  canUpdateIssues: true,
  canDeleteOwnIssues: true,
  canDeleteAnyIssue: role !== "member",
})

export const toOrganizationContext = (input: {
  name: string
  slug: string
  role: string
}): AgentOrganizationContext => {
  const role = normalizeOrganizationRole(input.role)
  return {
    name: input.name,
    slug: input.slug,
    role,
    permissions: permissionsForAgent(role),
  }
}

export const preserveAgentError = (
  cause: unknown,
  operation: string
): never => {
  if (cause instanceof AppError) throw cause
  throw publicErrors.internal(cause, { module: "agent", operation })
}

export const isRetryableDatabaseRace = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  const diagnostic = messages.join(" ")
  return (
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED") ||
    diagnostic.includes("database is locked")
  )
}
