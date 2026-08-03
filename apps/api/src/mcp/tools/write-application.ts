import { McpToolError } from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"

import { HttpError } from "../../errors/http-error"
import type { McpPrincipal } from "../principal"
import { createMcpAttachmentWriteApplication } from "./issue-attachment-application"
import { createMcpIssueWriteApplication } from "./issue-write-application"
import { createMcpAttachmentUploadSession } from "./upload-session-application"

export const toMcpToolError = (cause: unknown): McpToolError => {
  if (cause instanceof McpToolError) return cause
  if (cause instanceof HttpError) {
    if (
      cause.code === "conflict" ||
      cause.code === "forbidden" ||
      cause.code === "not_found" ||
      cause.code === "validation_error"
    ) {
      return new McpToolError(cause.code)
    }
    if (cause.code === "unauthorized") {
      return new McpToolError("forbidden")
    }
  }
  return new McpToolError("retryable_internal")
}

export const createMcpWriteApplication = (db: Db, principal: McpPrincipal) => ({
  ...createMcpIssueWriteApplication(db, principal),
  ...createMcpAttachmentWriteApplication(db, principal),
  createAttachmentUploadSession: (
    input: Parameters<typeof createMcpAttachmentUploadSession>[2]
  ) => createMcpAttachmentUploadSession(db, principal, input),
})
