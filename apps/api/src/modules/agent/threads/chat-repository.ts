import type {
  AgentUiContextReference,
  AgentUiMessage,
  AgentContentSegment,
  AgentContextReferenceInput,
  AgentResolvedContextReference,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import {
  files,
  member,
  organization,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { HttpError } from "../../../errors/http-error"
import { normalizeOrganizationRole } from "../../authorization/public"
import { listReusableAgentAssetsInTransaction } from "../../files/public"
import { findIssueById, findIssueByNumber } from "../../issues/public"
import { ensureAgentSessionContextInTransaction } from "../context/repository"
import { createAgentToken, hashAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import type { AgentTransaction } from "./repository-support"
import { issueConnectionTicketInTransaction } from "./thread-repository"

const resolveAgentContextReferencesInTransaction = async (
  tx: AgentTransaction,
  input: {
    organizationId: string
    references: readonly AgentContextReferenceInput[]
  }
): Promise<AgentResolvedContextReference[]> => {
  const resolved: AgentResolvedContextReference[] = []
  for (const reference of input.references) {
    if (reference.kind === "issue") {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const issue = await findIssueById(tx, {
        organizationId: input.organizationId,
        id: reference.id,
      })
      if (!issue) {
        throw new HttpError({ code: "not_found" })
      }
      resolved.push({
        kind: "issue",
        id: issue.id,
        number: issue.number,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
      })
      continue
    }
    if (reference.kind === "file") {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const rows = await tx
        .select({ id: files.id, filename: files.filename })
        .from(files)
        .where(
          and(
            eq(files.id, reference.id),
            eq(files.organizationId, input.organizationId),
            eq(files.status, "ready")
          )
        )
        .limit(1)
      const file = rows[0]
      if (!file) {
        throw new HttpError({ code: "not_found" })
      }
      resolved.push({ kind: "file", ...file })
      continue
    }
    if (reference.kind === "member") {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const rows = await tx
        .select({ id: user.id, name: user.name, role: member.role })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.userId, reference.id)
          )
        )
        .limit(1)
      const mentionedMember = rows[0]
      if (!mentionedMember) {
        throw new HttpError({ code: "not_found" })
      }
      resolved.push({
        kind: "member",
        id: mentionedMember.id,
        name: mentionedMember.name,
        role: normalizeOrganizationRole(mentionedMember.role),
      })
      continue
    }

    if (reference.kind !== "current_page") {
      throw new HttpError({ code: "validation_error" })
    }
    // Browser labelは信用せず、active organization slugとpage routeを再解決する。
    // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
    const organizationRows = await tx
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    const active = organizationRows[0]
    const path = reference.path.split(/[?#]/u, 1)[0] ?? reference.path
    if (!active || !path.startsWith(`/organization/${active.slug}`)) {
      throw new HttpError({ code: "validation_error" })
    }
    const issueNumberMatch = /\/issues\/([1-9][0-9]*)$/u.exec(path)
    if (issueNumberMatch) {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const issue = await findIssueByNumber(tx, {
        organizationId: input.organizationId,
        number: Number(issueNumberMatch[1]),
      })
      if (!issue) {
        throw new HttpError({ code: "not_found" })
      }
      resolved.push({
        kind: "current_page",
        path,
        title: `Issue #${issue.number}: ${issue.title}`,
      })
    } else {
      resolved.push({ kind: "current_page", path, title: "Current page" })
    }
  }
  return resolved
}

const toCanonicalContextReference = (
  reference: AgentResolvedContextReference
): AgentUiContextReference => {
  if (reference.kind === "issue") {
    return {
      kind: "issue",
      id: reference.id,
      label: `Issue #${reference.number}: ${reference.title}`,
    }
  }
  if (reference.kind === "file") {
    return { kind: "file", id: reference.id, label: reference.filename }
  }
  if (reference.kind === "member") {
    return { kind: "member", id: reference.id, label: reference.name }
  }
  return {
    kind: "current_page",
    path: reference.path,
    label: reference.title,
  }
}

const canonicalUserParts = (input: {
  assetIds: string[]
  contentSegments: AgentContentSegment[]
  resolvedReferences: AgentResolvedContextReference[]
}): AgentUiMessage["parts"] => {
  let referenceIndex = 0
  const parts: AgentUiMessage["parts"] = input.contentSegments.map(
    (segment) => {
      if (segment.type === "text") return segment
      const resolved = input.resolvedReferences[referenceIndex]
      referenceIndex += 1
      if (!resolved) throw new HttpError({ code: "validation_error" })
      return {
        type: "data-context-reference" as const,
        data: toCanonicalContextReference(resolved),
      }
    }
  )
  if (input.assetIds.length > 0) {
    parts.push({
      type: "data-agent-assets",
      data: { assetIds: input.assetIds },
    })
  }
  return parts
}

export const prepareAgentChatForSession = async (
  db: Db,
  input: {
    assetIds: string[]
    contentSegments: AgentContentSegment[]
    messageId: string
    sessionId: string
    threadId: string
    timezone: string
    userId: string
    now?: Date
  }
) => {
  const credential = await createAgentToken()
  return await db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const current = await requireLiveSession(tx, { ...input, now })
    await requireActiveMembership(tx, current)
    const thread = await requireOwnedThread(tx, {
      threadId: input.threadId,
      userId: input.userId,
      activeOrganizationId: current.activeOrganizationId,
    })
    if (
      input.assetIds.length === 0 &&
      !input.contentSegments.some(
        (segment) =>
          segment.type === "context_reference" || segment.text.trim() !== ""
      )
    ) {
      throw new HttpError({ code: "validation_error" })
    }
    const inputReferences = input.contentSegments.flatMap((segment) =>
      segment.type === "context_reference" ? [segment.reference] : []
    )
    const contextReferences = await resolveAgentContextReferencesInTransaction(
      tx,
      {
        organizationId: current.activeOrganizationId,
        references: inputReferences,
      }
    )
    const context = await ensureAgentSessionContextInTransaction(tx, {
      sessionId: input.sessionId,
      userId: input.userId,
      now,
    })
    const reusableAssets = await listReusableAgentAssetsInTransaction(tx, {
      currentAssetIds: input.assetIds,
      now,
      scope: {
        contextEpoch: context.contextEpoch,
        organizationId: current.activeOrganizationId,
        sessionId: input.sessionId,
        threadId: thread.id,
        userId: input.userId,
      },
    })
    const publicQueries = input.contentSegments.flatMap((segment) => {
      if (segment.type !== "text") return []
      return segment.text.split(/\r?\n/u).flatMap((line) => {
        const match =
          /^public-only web query\s*:\s*(.{2,200})$/iu.exec(line.trim()) ??
          /^公開情報だけのweb検索\s*[:：]\s*(.{2,200})$/iu.exec(line.trim())
        return match?.[1] ? [match[1]] : []
      })
    })
    const message: AgentUiMessage = {
      id: input.messageId,
      role: "user",
      parts: canonicalUserParts({
        assetIds: input.assetIds,
        contentSegments: input.contentSegments,
        resolvedReferences: contextReferences,
      }),
    }
    const connection = await issueConnectionTicketInTransaction(tx, {
      credential,
      current,
      now,
      sessionId: input.sessionId,
      threadId: thread.id,
      userId: input.userId,
      webSearchQueryHash:
        publicQueries.length === 1
          ? await hashAgentToken(`web-query\u0000${publicQueries[0]}`)
          : undefined,
    })
    return {
      ...connection,
      assetIds: input.assetIds,
      contextReferences,
      clientMessageId: message.id,
      messages: [message],
      reusableAssets,
      threadId: thread.id,
      timezone: input.timezone,
      trigger: "user_message" as const,
    }
  })
}
