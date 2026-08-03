import type { McpIssueWriteReceipt } from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import { issues, member } from "@enterprise-agentic-saas/db/schema"
import { and, eq, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"

export type McpTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export const normalizedLabels = (labels: readonly string[] | undefined) => {
  if (labels === undefined) return undefined
  const distinct = new Map<string, string>()
  for (const label of labels) {
    const trimmed = label.trim()
    const key = trimmed.toLocaleLowerCase("en-US")
    if (!distinct.has(key)) distinct.set(key, trimmed)
  }
  return [...distinct.values()]
}

export const canonicalizeLabels = async (
  tx: McpTransaction,
  organizationId: string,
  labels: readonly string[]
) => {
  const requested = normalizedLabels(labels) ?? []
  if (requested.length === 0) return []
  const keys = requested.map((label) => label.toLocaleLowerCase("en-US"))
  const rows = await tx.all<{
    canonical: string
    normalized: string
    variantCount: number | string
  }>(sql`
    select lower(trim(cast(json_each.value as text))) as normalized,
           min(trim(cast(json_each.value as text))) as canonical,
           count(distinct trim(cast(json_each.value as text))) as variantCount
    from ${issues}, json_each(${issues.labels})
    where ${issues.organizationId} = ${organizationId}
      and lower(trim(cast(json_each.value as text))) in (${sql.join(
        keys.map((key) => sql`${key}`),
        sql`, `
      )})
    group by lower(trim(cast(json_each.value as text)))
  `)
  const existing = new Map(rows.map((row) => [row.normalized, row]))
  return requested.map((label) => {
    const match = existing.get(label.toLocaleLowerCase("en-US"))
    if (!match) return label
    if (Number(match.variantCount) !== 1) {
      throw new HttpError({ code: "conflict" })
    }
    return match.canonical
  })
}

export const requireAssignee = async (
  tx: McpTransaction,
  input: { assigneeId: string | null | undefined; organizationId: string }
) => {
  if (input.assigneeId === null || input.assigneeId === undefined) return
  const rows = await tx
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, input.assigneeId)
      )
    )
    .limit(1)
  if (!rows[0]) throw new HttpError({ code: "validation_error" })
}

export const parseDueDate = (value: string | null | undefined) => {
  if (value === undefined || value === null) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError({ code: "validation_error" })
  }
  return parsed
}

export const issueReceipt = (input: {
  attachmentMutation?: McpIssueWriteReceipt["issue"]["attachmentMutation"]
  deleted: boolean
  id: string
  number: number
  operationId: string
  revision: number
}): McpIssueWriteReceipt => ({
  operationId: input.operationId,
  replayed: false,
  issue: {
    id: input.id,
    number: input.number,
    revision: input.revision,
    deleted: input.deleted,
    ...(input.attachmentMutation
      ? { attachmentMutation: input.attachmentMutation }
      : {}),
  },
})

export const requireIssueRevision = async (
  tx: McpTransaction,
  input: { expectedRevision: number; issueId: string; organizationId: string }
) => {
  const rows = await tx
    .select({ creatorId: issues.creatorId, revision: issues.revision })
    .from(issues)
    .where(
      and(
        eq(issues.id, input.issueId),
        eq(issues.organizationId, input.organizationId)
      )
    )
    .limit(1)
  const issue = rows[0]
  if (!issue) throw new HttpError({ code: "not_found" })
  if (issue.revision !== input.expectedRevision) {
    throw new HttpError({ code: "conflict" })
  }
  return issue
}
