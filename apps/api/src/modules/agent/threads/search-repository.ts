import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentMessages,
  agentThreads,
  issues,
  member,
  organization,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, like, sql } from "drizzle-orm"

import type {
  AgentAccountContext,
  AgentGetIssueInput,
  AgentIssue,
  AgentIssueDetail,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  AgentSearchIssuesInput,
} from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { normalizeOrganizationRole } from "../../authorization/public"
import {
  FILE_LIST_DEFAULT_LIMIT,
  listReadyFilesByOwner,
} from "../../files/public"
import {
  findIssueById,
  findIssueByNumber,
  listIssuesByOrganization,
} from "../../issues/public"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import {
  preserveAgentError,
  toAgentIssue,
  toAgentIssueAttachment,
  toOrganizationContext,
  toThreadDto,
  type AgentThreadDto,
} from "./repository-support"
import { withRunGrant } from "./run-repository"

export const renameAgentThreadForRun = async (
  db: Db,
  input: { grant: string; title: string; now?: Date }
): Promise<{ threadId: string; title: string; renamed: boolean }> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      if (context.runScope !== "chat") {
        throw publicErrors.conflict("Only a chat run can rename its thread", {
          resource: "agent_thread",
        })
      }
      const now = input.now ?? new Date()
      const rows = await tx
        .update(agentThreads)
        .set({
          title: input.title,
          titleState: "agent",
          titleRevision: sql`${agentThreads.titleRevision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentThreads.organizationId, context.organizationId),
            eq(agentThreads.id, context.threadId),
            eq(agentThreads.ownerUserId, context.userId),
            eq(agentThreads.status, "active"),
            eq(agentThreads.titleState, "untitled")
          )
        )
        .returning({ id: agentThreads.id, title: agentThreads.title })
      const renamed = rows[0]
      if (renamed) {
        return { threadId: renamed.id, title: renamed.title, renamed: true }
      }
      const current = await requireOwnedThread(tx, {
        threadId: context.threadId,
        userId: context.userId,
        activeOrganizationId: context.organizationId,
      })
      return { threadId: current.id, title: current.title, renamed: false }
    })
  } catch (cause) {
    return preserveAgentError(cause, "renameAgentThreadForRun")
  }
}

export const renameAgentThreadForSession = async (
  db: Db,
  input: {
    expectedRevision: number
    sessionId: string
    threadId: string
    title: string
    userId: string
    now?: Date
  }
): Promise<AgentThreadDto> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireLiveSession(tx, { ...input, now })
      await requireActiveMembership(tx, current)
      await requireOwnedThread(tx, {
        threadId: input.threadId,
        userId: input.userId,
        activeOrganizationId: current.activeOrganizationId,
      })
      const rows = await tx
        .update(agentThreads)
        .set({
          title: input.title,
          titleState: "user",
          titleRevision: input.expectedRevision + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.id, input.threadId),
            eq(agentThreads.ownerUserId, input.userId),
            eq(agentThreads.status, "active"),
            eq(agentThreads.titleRevision, input.expectedRevision)
          )
        )
        .returning()
      const renamed = rows[0]
      if (!renamed) {
        throw publicErrors.conflict("Agent thread title changed", {
          reason: "revision_conflict",
          resource: "agent_thread",
        })
      }
      const countRows = await tx
        .select({ value: sql<number>`count(*)` })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.organizationId, current.activeOrganizationId),
            eq(agentMessages.threadId, input.threadId)
          )
        )
      return toThreadDto(renamed, Number(countRows[0]?.value ?? 0))
    })
  } catch (cause) {
    return preserveAgentError(cause, "renameAgentThreadForSession")
  }
}

export const readAgentAccountContext = async (
  db: Db,
  input: { grant: string; now?: Date }
): Promise<AgentAccountContext> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const rows = await tx
        .select({ name: user.name, profileImage: user.image })
        .from(user)
        .where(eq(user.id, context.userId))
        .limit(1)
      const account = rows[0]
      if (!account) throw publicErrors.unauthorized()
      return account
    })
  } catch (cause) {
    return preserveAgentError(cause, "readAgentAccountContext")
  }
}

export const readAgentActiveOrganization = async (
  db: Db,
  input: { grant: string; now?: Date }
): Promise<AgentOrganizationContext> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const rows = await tx
        .select({
          name: organization.name,
          slug: organization.slug,
        })
        .from(organization)
        .where(eq(organization.id, context.organizationId))
        .limit(1)
      const active = rows[0]
      if (!active) {
        throw publicErrors.notFound("Organization not found", {
          resource: "organization",
        })
      }
      return toOrganizationContext({ ...active, role: context.role })
    })
  } catch (cause) {
    return preserveAgentError(cause, "readAgentActiveOrganization")
  }
}

export const searchAgentOrganizationMembers = async (
  db: Db,
  input: { grant: string; query: string; limit: number; now?: Date }
): Promise<AgentMember[]> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const condition = input.query
        ? and(
            eq(member.organizationId, context.organizationId),
            like(user.name, `%${input.query}%`)
          )
        : eq(member.organizationId, context.organizationId)
      const rows = await tx
        .select({
          id: user.id,
          name: user.name,
          profileImage: user.image,
          role: member.role,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(condition)
        .orderBy(asc(user.name), asc(user.id))
        .limit(input.limit)
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        profileImage: row.profileImage,
        role: normalizeOrganizationRole(row.role),
      }))
    })
  } catch (cause) {
    return preserveAgentError(cause, "searchAgentOrganizationMembers")
  }
}

export const searchAgentIssueLabels = async (
  db: Db,
  input: { grant: string; query: string; limit: number; now?: Date }
): Promise<AgentIssueLabel[]> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const query = input.query.toLowerCase()
      const rows = await tx.all<{
        label: string
        usageCount: number | string
      }>(sql`
        select min(trim(cast(json_each.value as text))) as label,
               count(*) as usageCount
        from ${issues}, json_each(${issues.labels})
        where ${issues.organizationId} = ${context.organizationId}
          and trim(cast(json_each.value as text)) != ''
          and (${query} = '' or lower(trim(cast(json_each.value as text))) like ${`%${query}%`})
        group by lower(trim(cast(json_each.value as text)))
        order by count(*) desc, label asc
        limit ${input.limit}
      `)
      return rows.map((row) => ({
        label: row.label,
        usageCount: Number(row.usageCount),
      }))
    })
  } catch (cause) {
    return preserveAgentError(cause, "searchAgentIssueLabels")
  }
}

export const searchAgentIssues = async (
  db: Db,
  input: AgentSearchIssuesInput & { now?: Date }
): Promise<AgentIssue[]> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const rows = await listIssuesByOrganization(tx, {
        organizationId: context.organizationId,
        search: input.search,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        label: input.label,
        sortBy: input.sortBy,
        sortDirection: input.sortDirection,
        limit: input.limit ?? 50,
      })
      return rows.map(toAgentIssue)
    })
  } catch (cause) {
    return preserveAgentError(cause, "searchAgentIssues")
  }
}

export const getAgentIssue = async (
  db: Db,
  input: AgentGetIssueInput & { now?: Date }
): Promise<AgentIssueDetail> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const issue =
        input.lookup === "id"
          ? await findIssueById(tx, {
              organizationId: context.organizationId,
              id: input.id,
            })
          : await findIssueByNumber(tx, {
              organizationId: context.organizationId,
              number: input.number,
            })
      if (!issue) {
        throw publicErrors.notFound("Issue not found", { resource: "issue" })
      }
      const attachments = await listReadyFilesByOwner(tx, {
        actorRole: context.role,
        actorUserId: context.userId,
        cursor: input.attachmentCursor,
        limit: input.attachmentLimit ?? FILE_LIST_DEFAULT_LIMIT,
        organizationId: context.organizationId,
        ownerId: issue.id,
        ownerType: "issue",
      })
      return {
        ...toAgentIssue(issue),
        attachments: {
          items: attachments.items.map(toAgentIssueAttachment),
          nextCursor: attachments.nextCursor,
        },
      }
    })
  } catch (cause) {
    return preserveAgentError(cause, "getAgentIssue")
  }
}
