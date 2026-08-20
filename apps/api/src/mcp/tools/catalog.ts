import {
  emptyToolInputSchema,
  issueSearchToolInputSchema,
  issueSearchToolOutputSchema,
  labelSearchToolInputSchema,
  labelSearchToolOutputSchema,
  memberSearchToolInputSchema,
  memberSearchToolOutputSchema,
  agentGetIssueToolOutputSchema,
  getIssueToolInputSchema,
  readAccountContextToolOutputSchema,
  readIssueAttachmentImageToolInputSchema,
  readIssueAttachmentImageToolResultSchema,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import type { ToolsInput } from "@mastra/core/agent"
import * as v from "valibot"

import {
  mcpAddIssueAttachmentsToolInputSchema,
  mcpCreateAttachmentUploadSessionToolInputSchema,
  mcpCreateAttachmentUploadSessionToolOutputSchema,
  mcpCreateIssueToolInputSchema,
  mcpDeleteIssueToolInputSchema,
  mcpGetAttachmentUploadStatusToolInputSchema,
  mcpGetAttachmentUploadStatusToolOutputSchema,
  mcpGetIssueProviderInputSchema,
  mcpIssueWriteReceiptSchema,
  mcpOrganizationContextSchema,
  mcpRemoveIssueAttachmentsToolInputSchema,
  mcpUpdateIssueToolInputSchema,
} from "../contracts"
import type { McpPrincipal } from "../principal"
import { createMcpDirectTool } from "./direct-tool"
import { toMcpToolError } from "./errors"
import { createMcpReadApplication } from "./read-application"
import { createMcpWriteApplication } from "./write-application"

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

const parseMcpBoundaryValue = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  value: unknown
): v.InferOutput<TSchema> => {
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) throw new Error("MCP tool execution failed")
  return parsed.output
}

export const createMcpTools = (db: Db, principal: McpPrincipal): ToolsInput => {
  const read = createMcpReadApplication(db, principal)
  const write = createMcpWriteApplication(db, principal)
  const tools: ToolsInput = {}

  if (principal.scopes.has("account:read")) {
    tools.read_account_context = createMcpDirectTool({
      id: "read_account_context",
      description:
        "Read the current user's allowlisted display profile. This never returns credentials or account settings.",
      annotations: readOnly,
      inputSchema: emptyToolInputSchema,
      outputSchema: readAccountContextToolOutputSchema,
      execute: safe(async () =>
        parseMcpBoundaryValue(
          readAccountContextToolOutputSchema,
          await read.readAccountContext()
        )
      ),
    })
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
    tools.get_issue = createMcpDirectTool({
      id: "get_issue",
      description:
        'Read one Issue in the active organization. For Issue #N use {"lookup":"number","number":N}; for an opaque ID use {"lookup":"id","id":"..."}.',
      annotations: readOnly,
      inputSchema: mcpGetIssueProviderInputSchema,
      outputSchema: agentGetIssueToolOutputSchema,
      execute: safe(async (input) =>
        parseMcpBoundaryValue(
          agentGetIssueToolOutputSchema,
          await read.getIssue(
            parseMcpBoundaryValue(getIssueToolInputSchema, input)
          )
        )
      ),
    })
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
