import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  fileCleanupJobs,
  files,
  organizationFileUsage,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, sql } from "drizzle-orm"

import { getFileOwnerAdapter } from "./owner-adapters"
import {
  isLegacyFileStorage,
  releaseDeletedFileStorageObjectsInTransaction,
} from "./storage-object-release"

type FileWithOwner = typeof files.$inferSelect & { ownerId: string }
type FileTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

const releaseUsage = async (
  tx: FileTransaction,
  input: { organizationId: string; sizeBytes: number }
) => {
  const rows = await tx
    .update(organizationFileUsage)
    .set({
      usedBytes: sql`${organizationFileUsage.usedBytes} - ${input.sizeBytes}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(organizationFileUsage.organizationId, input.organizationId),
        sql`${organizationFileUsage.usedBytes} >= ${input.sizeBytes}`
      )
    )
    .returning({ usedBytes: organizationFileUsage.usedBytes })
  if (!rows[0]) throw new Error("Organization file usage is inconsistent")
}

const deleteReadyFileAtIndex = async (
  tx: FileTransaction,
  input: { actorUserId: string; files: readonly FileWithOwner[]; now: Date },
  index: number
): Promise<boolean> => {
  const candidate = input.files[index]
  if (!candidate) return true
  const rows = await tx
    .delete(files)
    .where(
      and(
        eq(files.id, candidate.id),
        eq(files.organizationId, candidate.organizationId),
        eq(files.status, "ready")
      )
    )
    .returning({
      keyVersion: files.keyVersion,
      objectKey: files.objectKey,
      sizeBytes: files.sizeBytes,
      storageObjectId: files.storageObjectId,
    })
  const file = rows[0]
  if (!file) return false
  await releaseDeletedFileStorageObjectsInTransaction(tx, {
    files: [file],
    now: input.now,
    organizationId: candidate.organizationId,
  })
  await releaseUsage(tx, {
    organizationId: candidate.organizationId,
    sizeBytes: file.sizeBytes,
  })
  if (isLegacyFileStorage(file)) {
    await tx
      .insert(fileCleanupJobs)
      .values({
        id: crypto.randomUUID(),
        organizationId: candidate.organizationId,
        kind: "exact",
        objectKey: file.objectKey,
      })
      .onConflictDoNothing()
  }
  await getFileOwnerAdapter(candidate.ownerType).recordActivity(tx, {
    actorUserId: input.actorUserId,
    fileId: candidate.id,
    filename: candidate.filename,
    kind: "file_deleted",
    occurredAt: input.now,
    organizationId: candidate.organizationId,
    ownerId: candidate.ownerId,
  })
  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: candidate.organizationId,
    actorUserId: input.actorUserId,
    action: "file.deleted",
    targetType: "file",
    targetId: candidate.id,
    metadata: {},
  })
  return deleteReadyFileAtIndex(tx, input, index + 1)
}

export const deleteReadyFilesInTransaction = (
  tx: FileTransaction,
  input: { actorUserId: string; files: readonly FileWithOwner[]; now: Date }
) => deleteReadyFileAtIndex(tx, input, 0)
