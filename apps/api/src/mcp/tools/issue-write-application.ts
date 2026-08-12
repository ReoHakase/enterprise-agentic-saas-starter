import {
  mcpIssueWriteReceiptSchema,
  type McpCreateIssueToolInput,
  type McpDeleteIssueToolInput,
  type McpIssueWriteReceipt,
  type McpUpdateIssueToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import { issues, member } from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import { normalizeOrganizationRole } from "../../modules/authorization/public"
import {
  deleteIssueInTransaction,
  insertIssueInTransaction,
  normalizeIssueRequiredText,
  updateIssueInTransaction,
} from "../../modules/issues/public"
import type { McpPrincipal } from "../principal"
import { runIdempotently } from "./idempotency"
import { promoteMcpUploads } from "./issue-attachment-application"
import {
  canonicalizeLabels,
  issueReceipt,
  normalizedLabels,
  parseDueDate,
  requireAssignee,
  requireIssueRevision,
  type McpTransaction,
} from "./write-support"

const normalizedCreateInput = (input: McpCreateIssueToolInput) => ({
  title: normalizeIssueRequiredText(input.title, "title"),
  description: input.description?.trim() ?? "",
  status: input.status ?? ("open" as const),
  priority: input.priority ?? ("no_priority" as const),
  assigneeId:
    typeof input.assigneeId === "string"
      ? input.assigneeId.trim() || null
      : (input.assigneeId ?? null),
  labels: normalizedLabels(input.labels) ?? [],
  dueDate: input.dueDate ?? null,
  attachmentAssetIds: [...new Set(input.attachmentAssetIds ?? [])],
})

const normalizedUpdateInput = (input: McpUpdateIssueToolInput) => {
  const fields = [
    "assigneeId",
    "description",
    "dueDate",
    "labels",
    "priority",
    "status",
    "title",
  ] as const
  if (!fields.some((field) => Object.hasOwn(input, field))) {
    throw new HttpError({ code: "validation_error" })
  }
  return {
    issueId: input.issueId.trim(),
    expectedRevision: input.expectedRevision,
    ...(Object.hasOwn(input, "title")
      ? {
          title:
            input.title === undefined
              ? undefined
              : normalizeIssueRequiredText(input.title, "title"),
        }
      : {}),
    ...(Object.hasOwn(input, "description")
      ? { description: input.description?.trim() }
      : {}),
    ...(Object.hasOwn(input, "status") ? { status: input.status } : {}),
    ...(Object.hasOwn(input, "priority") ? { priority: input.priority } : {}),
    ...(Object.hasOwn(input, "assigneeId")
      ? {
          assigneeId:
            typeof input.assigneeId === "string"
              ? input.assigneeId.trim() || null
              : input.assigneeId,
        }
      : {}),
    ...(Object.hasOwn(input, "labels")
      ? { labels: normalizedLabels(input.labels) }
      : {}),
    ...(Object.hasOwn(input, "dueDate") ? { dueDate: input.dueDate } : {}),
  }
}

const requireCurrentDeletePermission = async (
  tx: McpTransaction,
  principal: McpPrincipal,
  issueId: string
) => {
  const memberships = await tx
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, principal.organizationId),
        eq(member.userId, principal.userId)
      )
    )
    .limit(1)
  const membership = memberships[0]
  if (!membership) throw new HttpError({ code: "forbidden" })
  const role = normalizeOrganizationRole(membership.role)
  if (role !== "member") return role

  const rows = await tx
    .select({ creatorId: issues.creatorId })
    .from(issues)
    .where(
      and(
        eq(issues.id, issueId),
        eq(issues.organizationId, principal.organizationId)
      )
    )
    .limit(1)
  const issue = rows[0]
  if (!issue) throw new HttpError({ code: "not_found" })
  if (issue.creatorId !== principal.userId) {
    throw new HttpError({ code: "forbidden" })
  }
  return role
}

export const createMcpIssueWriteApplication = (
  db: Db,
  principal: McpPrincipal
) => ({
  createIssue: async (
    input: McpCreateIssueToolInput
  ): Promise<McpIssueWriteReceipt> => {
    const normalized = normalizedCreateInput(input)
    if (
      normalized.attachmentAssetIds.length > 0 &&
      !principal.scopes.has("files:write")
    ) {
      throw new HttpError({ code: "forbidden" })
    }
    return runIdempotently({
      db,
      principal,
      idempotencyKey: input.idempotencyKey,
      payload: normalized,
      schema: mcpIssueWriteReceiptSchema,
      toolName: "create_issue",
      mutate: async (tx, operationId) => {
        await requireAssignee(tx, {
          assigneeId: normalized.assigneeId,
          organizationId: principal.organizationId,
        })
        const labels = await canonicalizeLabels(
          tx,
          principal.organizationId,
          normalized.labels
        )
        const created = await insertIssueInTransaction(tx, {
          id: crypto.randomUUID(),
          organizationId: principal.organizationId,
          creatorId: principal.userId,
          title: normalized.title,
          description: normalized.description,
          status: normalized.status,
          priority: normalized.priority,
          assigneeId: normalized.assigneeId,
          labels,
          dueDate: parseDueDate(normalized.dueDate) ?? null,
          now: new Date(),
          auditContext: { source: "mcp", actionId: operationId },
        })
        const fileIds = await promoteMcpUploads(tx, {
          assetIds: normalized.attachmentAssetIds,
          issueId: created.id,
          now: new Date(),
          operationId,
          principal,
        })
        return issueReceipt({
          operationId,
          id: created.id,
          number: created.number,
          revision: created.revision,
          deleted: false,
          ...(fileIds.length > 0
            ? {
                attachmentMutation: {
                  operation: "added" as const,
                  fileIds,
                },
              }
            : {}),
        })
      },
    })
  },

  updateIssue: async (
    input: McpUpdateIssueToolInput
  ): Promise<McpIssueWriteReceipt> => {
    const normalized = normalizedUpdateInput(input)
    return runIdempotently({
      db,
      principal,
      idempotencyKey: input.idempotencyKey,
      payload: normalized,
      schema: mcpIssueWriteReceiptSchema,
      toolName: "update_issue",
      mutate: async (tx, operationId) => {
        await requireIssueRevision(tx, {
          expectedRevision: normalized.expectedRevision,
          issueId: normalized.issueId,
          organizationId: principal.organizationId,
        })
        await requireAssignee(tx, {
          assigneeId: normalized.assigneeId,
          organizationId: principal.organizationId,
        })
        const labels = normalized.labels
          ? await canonicalizeLabels(
              tx,
              principal.organizationId,
              normalized.labels
            )
          : normalized.labels
        const updated = await updateIssueInTransaction(tx, {
          id: normalized.issueId,
          actorUserId: principal.userId,
          organizationId: principal.organizationId,
          expectedRevision: normalized.expectedRevision,
          title: normalized.title,
          description: normalized.description,
          status: normalized.status,
          priority: normalized.priority,
          assigneeId: normalized.assigneeId,
          labels,
          dueDate: parseDueDate(normalized.dueDate),
          now: new Date(),
          auditContext: { source: "mcp", actionId: operationId },
        })
        if (!updated) throw new HttpError({ code: "conflict" })
        return issueReceipt({
          operationId,
          id: updated.id,
          number: updated.number,
          revision: updated.revision,
          deleted: false,
        })
      },
    })
  },

  deleteIssue: async (
    input: McpDeleteIssueToolInput
  ): Promise<McpIssueWriteReceipt> => {
    const payload = {
      issueId: input.issueId.trim(),
      expectedRevision: input.expectedRevision,
    }
    return runIdempotently({
      authorize: async (tx) => {
        await requireCurrentDeletePermission(tx, principal, payload.issueId)
      },
      db,
      principal,
      idempotencyKey: input.idempotencyKey,
      payload,
      schema: mcpIssueWriteReceiptSchema,
      toolName: "delete_issue",
      mutate: async (tx, operationId) => {
        const role = await requireCurrentDeletePermission(
          tx,
          principal,
          payload.issueId
        )
        const current = await requireIssueRevision(tx, {
          expectedRevision: payload.expectedRevision,
          issueId: payload.issueId,
          organizationId: principal.organizationId,
        })
        if (role === "member" && current.creatorId !== principal.userId) {
          throw new HttpError({ code: "forbidden" })
        }
        const deleted = await deleteIssueInTransaction(tx, {
          id: payload.issueId,
          actorUserId: principal.userId,
          organizationId: principal.organizationId,
          expectedRevision: payload.expectedRevision,
          now: new Date(),
          auditContext: { source: "mcp", actionId: operationId },
        })
        if (!deleted) throw new HttpError({ code: "conflict" })
        return issueReceipt({
          operationId,
          id: deleted.id,
          number: deleted.number,
          revision: deleted.revision,
          deleted: true,
        })
      },
    })
  },
})
