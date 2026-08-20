import type {
  AgentAccountContext,
  AgentIssue,
  AgentIssueAttachment,
  AgentIssueDetail,
  AgentIssueLabel,
  AgentMember,
  GetIssueToolInput,
  IssueSearchToolInput,
  LabelSearchToolInput,
  MemberSearchToolInput,
  ReadIssueAttachmentImageToolInput,
  ReadIssueAttachmentImageToolResult,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import {
  files,
  issues,
  issueFileOwners,
  mcpAttachmentUploads,
  member,
  organization,
  storageObjects,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, like, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import { normalizeOrganizationRole } from "../../modules/authorization/public"
import {
  FILE_LIST_DEFAULT_LIMIT,
  listReadyFilesByOwner,
} from "../../modules/files/public"
import {
  findIssueById,
  findIssueByNumber,
  listIssuesByOrganization,
  type IssueDto,
} from "../../modules/issues/public"
import type {
  McpGetAttachmentUploadStatusToolInput,
  McpGetAttachmentUploadStatusToolOutput,
  McpOrganizationContext,
} from "../contracts"
import type { McpPrincipal } from "../principal"

const toIssue = (issue: IssueDto): AgentIssue => ({
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

const toAttachment = (
  file: Awaited<ReturnType<typeof listReadyFilesByOwner>>["items"][number]
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

const organizationPermissions = (
  principal: McpPrincipal
): McpOrganizationContext["permissions"] => ({
  canReadIssues: principal.scopes.has("issues:read"),
  canCreateIssues: principal.scopes.has("issues:create"),
  canUpdateIssues: principal.scopes.has("issues:update"),
  canDeleteOwnIssues: principal.scopes.has("issues:delete"),
  canDeleteAnyIssue:
    principal.role !== "member" && principal.scopes.has("issues:delete"),
})

export const createMcpReadApplication = (db: Db, principal: McpPrincipal) => ({
  readAccountContext: async (): Promise<AgentAccountContext> => {
    const rows = await db
      .select({ name: user.name, profileImage: user.image })
      .from(user)
      .where(eq(user.id, principal.userId))
      .limit(1)
    const account = rows[0]
    if (!account) throw new HttpError({ code: "unauthorized" })
    return account
  },

  readActiveOrganization: async (): Promise<McpOrganizationContext> => {
    const rows = await db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, principal.organizationId))
      .limit(1)
    const active = rows[0]
    if (!active) throw new HttpError({ code: "not_found" })
    return {
      ...active,
      role: principal.role,
      permissions: organizationPermissions(principal),
    }
  },

  searchOrganizationMembers: async (
    input: MemberSearchToolInput
  ): Promise<AgentMember[]> => {
    const query = input.query?.trim() ?? ""
    const condition = query
      ? and(
          eq(member.organizationId, principal.organizationId),
          like(user.name, `%${query}%`)
        )
      : eq(member.organizationId, principal.organizationId)
    const rows = await db
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
  },

  searchIssueLabels: async (
    input: LabelSearchToolInput
  ): Promise<AgentIssueLabel[]> => {
    const query = input.query?.trim().toLowerCase() ?? ""
    const rows = await db.all<{
      label: string
      usageCount: number | string
    }>(sql`
      select min(trim(cast(json_each.value as text))) as label,
             count(*) as usageCount
      from ${issues}, json_each(${issues.labels})
      where ${issues.organizationId} = ${principal.organizationId}
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
  },

  searchIssues: async (input: IssueSearchToolInput): Promise<AgentIssue[]> => {
    const rows = await listIssuesByOrganization(db, {
      organizationId: principal.organizationId,
      search: input.search,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      label: input.label,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    })
    return rows.map(toIssue)
  },

  getIssue: async (input: GetIssueToolInput): Promise<AgentIssueDetail> => {
    const issue =
      input.lookup === "id"
        ? await findIssueById(db, {
            id: input.id,
            organizationId: principal.organizationId,
          })
        : await findIssueByNumber(db, {
            number: input.number,
            organizationId: principal.organizationId,
          })
    if (!issue) throw new HttpError({ code: "not_found" })
    const attachments = await listReadyFilesByOwner(db, {
      actorRole: principal.role,
      actorUserId: principal.userId,
      cursor: input.attachmentCursor,
      limit: input.attachmentLimit ?? FILE_LIST_DEFAULT_LIMIT,
      organizationId: principal.organizationId,
      ownerId: issue.id,
      ownerType: "issue",
    })
    return {
      ...toIssue(issue),
      attachments: {
        items: attachments.items.map(toAttachment),
        nextCursor: attachments.nextCursor,
      },
    }
  },

  readIssueAttachmentImage: async (
    input: ReadIssueAttachmentImageToolInput
  ): Promise<ReadIssueAttachmentImageToolResult> => {
    const rows = await db
      .select({
        contentType: files.declaredContentType,
        fileId: files.id,
        issueId: issueFileOwners.issueId,
        sizeBytes: files.sizeBytes,
      })
      .from(files)
      .innerJoin(
        issueFileOwners,
        and(
          eq(issueFileOwners.organizationId, files.organizationId),
          eq(issueFileOwners.fileId, files.id),
          eq(issueFileOwners.ownerType, "issue")
        )
      )
      .where(
        and(
          eq(files.organizationId, principal.organizationId),
          eq(files.id, input.fileId),
          eq(files.status, "ready"),
          eq(issueFileOwners.issueId, input.issueId),
          sql`${files.detectedImageFormat} in ('jpeg', 'png', 'webp', 'gif')`
        )
      )
      .limit(1)
    const image = rows[0]
    if (!image) throw new HttpError({ code: "not_found" })
    return {
      contentType: "image/webp",
      fileId: image.fileId,
      issueId: image.issueId,
      sizeBytes: image.sizeBytes,
    }
  },

  getAttachmentUploadStatus: async (
    input: McpGetAttachmentUploadStatusToolInput
  ): Promise<McpGetAttachmentUploadStatusToolOutput> => {
    const rows = await db
      .select({ upload: mcpAttachmentUploads, storage: storageObjects })
      .from(mcpAttachmentUploads)
      .innerJoin(
        storageObjects,
        and(
          eq(
            storageObjects.organizationId,
            mcpAttachmentUploads.organizationId
          ),
          eq(storageObjects.id, mcpAttachmentUploads.storageObjectId)
        )
      )
      .where(
        and(
          eq(mcpAttachmentUploads.id, input.uploadId),
          eq(mcpAttachmentUploads.organizationId, principal.organizationId),
          eq(mcpAttachmentUploads.userId, principal.userId),
          eq(mcpAttachmentUploads.clientId, principal.clientId)
        )
      )
      .limit(1)
    const row = rows[0]
    if (!row) throw new HttpError({ code: "not_found" })
    const status =
      (row.upload.status === "pending" || row.upload.status === "ready") &&
      row.upload.expiresAt.getTime() <= Date.now()
        ? "expired"
        : row.upload.status
    return {
      assetId: status === "ready" ? row.upload.id : null,
      expiresAt: row.upload.expiresAt.toISOString(),
      sizeBytes: row.storage.sizeBytes,
      status,
      uploadId: row.upload.id,
    }
  },
})
