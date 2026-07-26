import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentMessages,
  agentThreads,
  files,
  member,
  organization,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import type {
  AgentCanonicalContextReference,
  AgentCanonicalMessage,
  AgentContentSegment,
  AgentContextReferenceInput,
  AgentResolvedContextReference,
} from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { normalizeOrganizationRole } from "../../authorization/public"
import { findIssueById, findIssueByNumber } from "../../issues/public"
import { createAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import {
  listModelContextInTransaction,
  parseCanonicalMessage,
  preserveAgentError,
  type AgentTransaction,
} from "./repository-support"
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
        throw publicErrors.notFound("Mentioned Issue not found", {
          resource: "issue",
        })
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
        throw publicErrors.notFound("Mentioned file not found", {
          resource: "file",
        })
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
        throw publicErrors.notFound("Mentioned member not found", {
          resource: "member",
        })
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
      throw publicErrors.validation("Invalid context reference")
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
      throw publicErrors.validation(
        "Current page is outside the active organization"
      )
    }
    const issueNumberMatch = /\/issues\/([1-9][0-9]*)$/u.exec(path)
    if (issueNumberMatch) {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const issue = await findIssueByNumber(tx, {
        organizationId: input.organizationId,
        number: Number(issueNumberMatch[1]),
      })
      if (!issue) {
        throw publicErrors.notFound("Current page Issue not found", {
          resource: "issue",
        })
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
): AgentCanonicalContextReference => {
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
}): AgentCanonicalMessage["parts"] => {
  let referenceIndex = 0
  const parts: AgentCanonicalMessage["parts"] = input.contentSegments.map(
    (segment) => {
      if (segment.type === "text") return segment
      const resolved = input.resolvedReferences[referenceIndex]
      referenceIndex += 1
      if (!resolved) throw publicErrors.validation("Invalid context reference")
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
  try {
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
        throw publicErrors.validation("Agent message is empty")
      }
      const inputReferences = input.contentSegments.flatMap((segment) =>
        segment.type === "context_reference" ? [segment.reference] : []
      )
      const contextReferences =
        await resolveAgentContextReferencesInTransaction(tx, {
          organizationId: current.activeOrganizationId,
          references: inputReferences,
        })
      const parsedMessage = parseCanonicalMessage(
        {
          id: input.messageId,
          role: "user",
          parts: canonicalUserParts({
            assetIds: input.assetIds,
            contentSegments: input.contentSegments,
            resolvedReferences: contextReferences,
          }),
        },
        "user"
      )
      const content = { parts: parsedMessage.parts }
      const inserted = await tx
        .insert(agentMessages)
        .values({
          id: crypto.randomUUID(),
          organizationId: current.activeOrganizationId,
          threadId: thread.id,
          clientMessageId: parsedMessage.id,
          role: "user",
          content,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: agentMessages.id })
      if (!inserted[0]) {
        const existingRows = await tx
          .select({ content: agentMessages.content, role: agentMessages.role })
          .from(agentMessages)
          .where(
            and(
              eq(agentMessages.organizationId, current.activeOrganizationId),
              eq(agentMessages.threadId, thread.id),
              eq(agentMessages.clientMessageId, parsedMessage.id)
            )
          )
          .limit(1)
        const existing = existingRows[0]
        if (
          !existing ||
          existing.role !== "user" ||
          JSON.stringify(existing.content) !== JSON.stringify(content)
        ) {
          throw publicErrors.conflict("Agent message id is already in use", {
            reason: "idempotency_conflict",
            resource: "agent_message",
          })
        }
      }
      await tx
        .update(agentThreads)
        .set({ updatedAt: now })
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.id, thread.id)
          )
        )
      const connection = await issueConnectionTicketInTransaction(tx, {
        credential,
        current,
        now,
        sessionId: input.sessionId,
        threadId: thread.id,
        userId: input.userId,
      })
      const messages = await listModelContextInTransaction(tx, {
        organizationId: current.activeOrganizationId,
        threadId: thread.id,
      })
      return {
        ...connection,
        assetIds: input.assetIds,
        contextReferences,
        clientMessageId: parsedMessage.id,
        messages,
        threadId: thread.id,
        timezone: input.timezone,
        trigger: "user_message" as const,
      }
    })
  } catch (cause) {
    return preserveAgentError(cause, "prepareAgentChatForSession")
  }
}
