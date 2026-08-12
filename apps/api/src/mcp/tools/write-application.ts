import { McpToolError } from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"

import { HttpError } from "../../errors/http-error"
import type { McpPrincipal } from "../principal"
import { createMcpAttachmentWriteApplication } from "./issue-attachment-application"
import { createMcpIssueWriteApplication } from "./issue-write-application"
import { createMcpAttachmentUploadSession } from "./upload-session-application"

export const toMcpToolError = (cause: unknown): McpToolError => {
  let current: unknown = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof McpToolError) return current
    if (current instanceof HttpError) {
      if (
        current.code === "conflict" ||
        current.code === "forbidden" ||
        current.code === "not_found" ||
        current.code === "rate_limited" ||
        current.code === "validation_error"
      ) {
        return new McpToolError(current.code)
      }
      if (current.code === "unauthorized") {
        return new McpToolError("forbidden")
      }
    }
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
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
