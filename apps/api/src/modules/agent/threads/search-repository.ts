import type { Db } from "@enterprise-agentic-saas/db"
import {
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
  preserveAgentError,
  toAgentIssue,
  toAgentIssueAttachment,
  toOrganizationContext,
} from "./repository-support"
import { withRunGrant } from "./run-repository"

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
