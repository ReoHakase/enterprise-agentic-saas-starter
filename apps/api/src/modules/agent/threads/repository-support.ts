import type {
  AgentIssue,
  AgentIssueAttachment,
  AgentOrganizationContext,
  AgentThread,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import type { agentThreads } from "@enterprise-agentic-saas/db/schema"

import { normalizeOrganizationRole } from "../../authorization/public"
import type { FileDto } from "../../files/public"
import type { IssueDto } from "../../issues/public"
export * from "./domain"

export type AgentTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export type AgentThreadDto = AgentThread

export const CONNECTION_TICKET_TTL_MS = 60_000
export const AGENT_RUN_TTL_MS = 5 * 60_000

export const toThreadDto = (
  thread: typeof agentThreads.$inferSelect
): AgentThreadDto => ({
  id: thread.id,
  title: "New conversation",
  status: thread.status,
  createdAt: thread.createdAt.toISOString(),
  updatedAt: (thread.archivedAt ?? thread.createdAt).toISOString(),
})

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
