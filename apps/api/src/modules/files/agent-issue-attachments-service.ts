import type { Db } from "@enterprise-agentic-saas/db"

import { AppError } from "../../errors/app-error"
import { findIssueAttachmentForModel } from "./agent-issue-attachments-repository"
import { createModelImageResponse } from "./model-image-service"
import { getFileStorageRuntime, type FileStorageRuntime } from "./runtime"

const providerUnavailable = () =>
  new AppError({
    code: "service_unavailable",
    publicMessage: "Service temporarily unavailable",
    statusCode: 503,
    publicContext: { retryAfter: 30 },
    privateContext: {
      module: "agent-issue-attachments",
      operation: "getFileStorageRuntime",
      provider: "runtime",
    },
  })

const getRuntime = (): FileStorageRuntime => {
  try {
    return getFileStorageRuntime()
  } catch {
    throw providerUnavailable()
  }
}

export const getIssueAttachmentImageForModel = async (
  db: Db,
  input: { grant: string; issueId: string; fileId: string }
): Promise<Response> => {
  const stored = await findIssueAttachmentForModel(db, input)
  if (!stored.etag) {
    throw new Error("Ready issue attachment is missing its etag")
  }
  return createModelImageResponse(getRuntime(), {
    etag: stored.etag,
    objectKey: stored.objectKey,
    resource: "issue_attachment",
  })
}
