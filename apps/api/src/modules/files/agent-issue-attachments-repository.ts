import type { Db } from "@enterprise-agentic-saas/db"
import { files, issueFileOwners } from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray } from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import { hashAgentToken } from "../agent/crypto"
import { validateGrantInTransaction } from "../agent/threads/repository"
import {
  AGENT_USAGE_DAY_MS,
  consumeAgentResourceLimitInTransaction,
  hashedAgentUsageOperationId,
  utcUsageWindow,
} from "../agent/usage/resource-limits"
import {
  AGENT_ASSET_VISION_ORGANIZATION_DAILY_LIMIT,
  AGENT_ASSET_VISION_USER_DAILY_LIMIT,
  previewableImageFormats,
} from "./constants"
import type { StoredFile } from "./repository"

const attachmentNotFound = () =>
  publicErrors.notFound("Issue attachment not found", {
    resource: "issue_attachment",
  })

const preserveIssueAttachmentError = (
  cause: unknown,
  operation: string
): never => {
  if (cause instanceof AppError) throw cause
  throw publicErrors.internal(cause, {
    module: "agent-issue-attachments",
    operation,
  })
}

/**
 * modelへ渡すIssue画像の認可とquota消費を同じtransactionに閉じる。
 * tenant外、owner不一致、pending、非対応画像は同じ404へ丸める。
 */
export const findIssueAttachmentForModel = async (
  db: Db,
  input: {
    grant: string
    issueId: string
    fileId: string
    now?: Date
  }
): Promise<StoredFile> => {
  const tokenHash = await hashAgentToken(input.grant)
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash,
        kind: "run",
        now,
      })
      if (!context.runId || context.runScope !== "chat") {
        throw publicErrors.unauthorized("Agent capability is invalid")
      }

      const rows = await tx
        .select({ stored: files })
        .from(files)
        .innerJoin(
          issueFileOwners,
          and(
            eq(issueFileOwners.fileId, files.id),
            eq(issueFileOwners.organizationId, files.organizationId),
            eq(issueFileOwners.ownerType, files.ownerType)
          )
        )
        .where(
          and(
            eq(files.id, input.fileId),
            eq(files.organizationId, context.organizationId),
            eq(files.ownerType, "issue"),
            eq(files.status, "ready"),
            inArray(files.detectedImageFormat, previewableImageFormats),
            eq(issueFileOwners.organizationId, context.organizationId),
            eq(issueFileOwners.issueId, input.issueId)
          )
        )
        .limit(1)
      const stored = rows[0]?.stored
      if (!stored || !stored.etag) throw attachmentNotFound()

      const operationId = await hashedAgentUsageOperationId(
        "vision-issue",
        context.runId,
        input.fileId
      )
      const dailyWindow = utcUsageWindow(now, AGENT_USAGE_DAY_MS)
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "vision_transform",
        limitCount: AGENT_ASSET_VISION_USER_DAILY_LIMIT,
        now,
        operationId,
        organizationId: context.organizationId,
        userId: context.userId,
        ...dailyWindow,
      })
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "vision_transform",
        limitCount: AGENT_ASSET_VISION_ORGANIZATION_DAILY_LIMIT,
        now,
        operationId,
        organizationId: context.organizationId,
        userId: null,
        ...dailyWindow,
      })
      return stored
    })
  } catch (cause) {
    return preserveIssueAttachmentError(cause, "findIssueAttachmentForModel")
  }
}
