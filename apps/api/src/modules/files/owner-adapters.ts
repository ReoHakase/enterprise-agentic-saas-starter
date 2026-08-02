import type { Db } from "@enterprise-agentic-saas/db"
import { issueActivityEvents, issues } from "@enterprise-agentic-saas/db/schema"
import type { issueFileOwners } from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import { fileOwnerPrefix, type FileOwnerType } from "./constants"

type FileTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

type FileOwnerActivityInput = {
  actorUserId: string
  fileId: string
  filename: string
  kind: "file_added" | "file_deleted"
  occurredAt: Date
  organizationId: string
  ownerId: string
}

type FileOwnerAdapter = {
  type: FileOwnerType
  assertExists(
    db: Db,
    input: { organizationId: string; ownerId: string }
  ): Promise<void>
  ownerRow(input: {
    fileId: string
    organizationId: string
    ownerId: string
  }): typeof issueFileOwners.$inferInsert
  recordActivity(
    tx: FileTransaction,
    input: FileOwnerActivityInput
  ): Promise<void>
  cleanupPrefix(input: { organizationId: string; ownerId: string }): string
}

const issueOwnerAdapter: FileOwnerAdapter = {
  type: "issue",
  async assertExists(db, input) {
    const rows = await db
      .select({ id: issues.id })
      .from(issues)
      .where(
        and(
          eq(issues.id, input.ownerId),
          eq(issues.organizationId, input.organizationId)
        )
      )
      .limit(1)
    if (!rows[0]) {
      throw new HttpError({ code: "not_found" })
    }
  },
  ownerRow: ({ fileId, organizationId, ownerId }) => ({
    fileId,
    organizationId,
    ownerType: "issue",
    issueId: ownerId,
  }),
  async recordActivity(tx, input) {
    const action = input.kind === "file_added" ? "added" : "deleted"
    const id = `file:${input.fileId}:${action}`
    await tx.insert(issueActivityEvents).values({
      id,
      organizationId: input.organizationId,
      issueId: input.ownerId,
      actorUserId: input.actorUserId,
      batchId: id,
      position: 0,
      kind: input.kind,
      field: null,
      fromValue: input.kind === "file_deleted" ? input.filename : null,
      toValue: input.kind === "file_added" ? input.filename : null,
      createdAt: input.occurredAt,
    })
  },
  cleanupPrefix: ({ organizationId, ownerId }) =>
    fileOwnerPrefix({ organizationId, ownerId, ownerType: "issue" }),
}

const adapters = { issue: issueOwnerAdapter } satisfies Record<
  FileOwnerType,
  FileOwnerAdapter
>

export const getFileOwnerAdapter = (ownerType: FileOwnerType) =>
  adapters[ownerType]
