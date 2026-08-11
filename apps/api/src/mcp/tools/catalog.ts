import {
  emptyToolInputSchema,
  issueSearchToolInputSchema,
  issueSearchToolOutputSchema,
  labelSearchToolInputSchema,
  labelSearchToolOutputSchema,
  mcpAddIssueAttachmentsToolInputSchema,
  mcpCreateAttachmentUploadSessionToolInputSchema,
  mcpCreateAttachmentUploadSessionToolOutputSchema,
  mcpCreateIssueToolInputSchema,
  mcpDeleteIssueToolInputSchema,
  mcpGetAttachmentUploadStatusToolInputSchema,
  mcpGetAttachmentUploadStatusToolOutputSchema,
  mcpIssueWriteReceiptSchema,
  mcpOrganizationContextSchema,
  mcpRemoveIssueAttachmentsToolInputSchema,
  mcpUpdateIssueToolInputSchema,
  memberSearchToolInputSchema,
  memberSearchToolOutputSchema,
  readIssueAttachmentImageToolInputSchema,
  readIssueAttachmentImageToolResultSchema,
} from "@enterprise-agentic-saas/agent-contracts"
import {
  createGetIssueTool,
  createReadAccountContextTool,
} from "@enterprise-agentic-saas/agent-tools"
import type { Db } from "@enterprise-agentic-saas/db"
import type { ToolsInput } from "@mastra/core/agent"

import type { McpPrincipal } from "../principal"
import { createMcpDirectTool, createMcpSharedTool } from "./direct-tool"
import { createMcpReadApplication } from "./read-application"
import { createMcpWriteApplication, toMcpToolError } from "./write-application"

const readOnly = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
}

const mutating = {
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: false,
}

const safe =
  <Input, Output>(executor: (input: Input) => Promise<Output>) =>
  async (input: Input): Promise<Output> => {
    try {
      return await executor(input)
    } catch (cause) {
      throw toMcpToolError(cause)
    }
  }

export const createMcpTools = (db: Db, principal: McpPrincipal): ToolsInput => {
  const read = createMcpReadApplication(db, principal)
  const write = createMcpWriteApplication(db, principal)
  const tools: ToolsInput = {}

  if (principal.scopes.has("account:read")) {
    tools.read_account_context = createMcpSharedTool(
      createReadAccountContextTool(async () => read.readAccountContext())
    )
  }
  if (principal.scopes.has("organization:read")) {
    tools.read_active_organization = createMcpDirectTool({
      id: "read_active_organization",
      description: "Read the active organization context and permissions.",
      annotations: readOnly,
      inputSchema: emptyToolInputSchema,
      outputSchema: mcpOrganizationContextSchema,
      execute: safe(read.readActiveOrganization),
    })
  }
  if (principal.scopes.has("members:read")) {
    tools.search_organization_members = createMcpDirectTool({
      id: "search_organization_members",
      description: "Search members in the active organization.",
      annotations: readOnly,
      inputSchema: memberSearchToolInputSchema,
      outputSchema: memberSearchToolOutputSchema,
      execute: safe(read.searchOrganizationMembers),
    })
  }
  if (principal.scopes.has("issues:read")) {
    tools.search_issue_labels = createMcpDirectTool({
      id: "search_issue_labels",
      description: "Search Issue labels in the active organization.",
      annotations: readOnly,
      inputSchema: labelSearchToolInputSchema,
      outputSchema: labelSearchToolOutputSchema,
      execute: safe(read.searchIssueLabels),
    })
    tools.search_issues = createMcpDirectTool({
      id: "search_issues",
      description: "Search Issues in the active organization.",
      annotations: readOnly,
      inputSchema: issueSearchToolInputSchema,
      outputSchema: issueSearchToolOutputSchema,
      execute: safe(read.searchIssues),
    })
    tools.get_issue = createMcpSharedTool(
      createGetIssueTool(async (input) => read.getIssue(input))
    )
  }
  if (
    principal.scopes.has("issues:read") &&
    principal.scopes.has("files:read")
  ) {
    tools.read_issue_attachment_image = createMcpDirectTool({
      id: "read_issue_attachment_image",
      description: "Read safe metadata for one Issue image attachment.",
      annotations: readOnly,
      inputSchema: readIssueAttachmentImageToolInputSchema,
      outputSchema: readIssueAttachmentImageToolResultSchema,
      execute: safe(read.readIssueAttachmentImage),
    })
  }
  if (principal.scopes.has("issues:create")) {
    tools.create_issue = createMcpDirectTool({
      id: "create_issue",
      description: "Create an Issue directly in the active organization.",
      annotations: mutating,
      inputSchema: mcpCreateIssueToolInputSchema,
      outputSchema: mcpIssueWriteReceiptSchema,
      execute: safe(write.createIssue),
    })
  }
  if (principal.scopes.has("issues:update")) {
    tools.update_issue = createMcpDirectTool({
      id: "update_issue",
      description: "Update an Issue at its expected revision.",
      annotations: mutating,
      inputSchema: mcpUpdateIssueToolInputSchema,
      outputSchema: mcpIssueWriteReceiptSchema,
      execute: safe(write.updateIssue),
    })
  }
  if (principal.scopes.has("issues:delete")) {
    tools.delete_issue = createMcpDirectTool({
      id: "delete_issue",
      description: "Delete an Issue at its expected revision.",
      annotations: mutating,
      inputSchema: mcpDeleteIssueToolInputSchema,
      outputSchema: mcpIssueWriteReceiptSchema,
      execute: safe(write.deleteIssue),
    })
  }
  if (
    principal.scopes.has("issues:update") &&
    principal.scopes.has("files:write")
  ) {
    tools.add_issue_attachments = createMcpDirectTool({
      id: "add_issue_attachments",
      description: "Attach ready MCP uploads to an Issue.",
      annotations: mutating,
      inputSchema: mcpAddIssueAttachmentsToolInputSchema,
      outputSchema: mcpIssueWriteReceiptSchema,
      execute: safe(write.addIssueAttachments),
    })
    tools.remove_issue_attachments = createMcpDirectTool({
      id: "remove_issue_attachments",
      description: "Remove ready attachments from an Issue.",
      annotations: mutating,
      inputSchema: mcpRemoveIssueAttachmentsToolInputSchema,
      outputSchema: mcpIssueWriteReceiptSchema,
      execute: safe(write.removeIssueAttachments),
    })
  }
  if (principal.scopes.has("files:write")) {
    tools.create_attachment_upload_session = createMcpDirectTool({
      id: "create_attachment_upload_session",
      description: "Create a short-lived, single-use attachment upload URL.",
      annotations: { ...mutating, destructiveHint: false },
      inputSchema: mcpCreateAttachmentUploadSessionToolInputSchema,
      outputSchema: mcpCreateAttachmentUploadSessionToolOutputSchema,
      execute: safe(write.createAttachmentUploadSession),
    })
    tools.get_attachment_upload_status = createMcpDirectTool({
      id: "get_attachment_upload_status",
      description: "Read an upload owned by this MCP credential.",
      annotations: readOnly,
      inputSchema: mcpGetAttachmentUploadStatusToolInputSchema,
      outputSchema: mcpGetAttachmentUploadStatusToolOutputSchema,
      execute: safe(read.getAttachmentUploadStatus),
    })
  }

  return tools
}
