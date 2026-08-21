import type { Db } from "@enterprise-agentic-saas/db"

import type { McpPrincipal } from "../principal"
import { createMcpAttachmentWriteApplication } from "./issue-attachment-application"
import { createMcpIssueWriteApplication } from "./issue-write-application"
import { createMcpAttachmentUploadSession } from "./upload-session-application"

export const createMcpWriteApplication = (db: Db, principal: McpPrincipal) => ({
  ...createMcpIssueWriteApplication(db, principal),
  ...createMcpAttachmentWriteApplication(db, principal),
  createAttachmentUploadSession: (
    input: Parameters<typeof createMcpAttachmentUploadSession>[2]
  ) => createMcpAttachmentUploadSession(db, principal, input),
})
