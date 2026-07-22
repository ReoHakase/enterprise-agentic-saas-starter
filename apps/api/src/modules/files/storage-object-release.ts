import type { Db } from "@enterprise-agentic-saas/db"
import {
  storageObjectCleanupJobs,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, sql } from "drizzle-orm"

export type StorageObjectReleaseTransaction = Parameters<
  Parameters<Db["transaction"]>[0]
>[0]

export type DeletedFileStorageSnapshot = {
  keyVersion: number | null
  objectKey: string
  storageObjectId: string | null
}

/**
 * file delete triggerがfile claimを外した直後に呼ぶ。
 * v2はrevision付きexact cleanupへ、backfill済みv1 metadataはlegacy jobと
 * 独立して削除する。storageObjectId=nullの旧writeはlegacy cleanupだけを使う。
 */
export const releaseDeletedFileStorageObjectsInTransaction = async (
  tx: StorageObjectReleaseTransaction,
  input: {
    files: readonly DeletedFileStorageSnapshot[]
    now: Date
    organizationId: string
  }
) => {
  for (const file of input.files) {
    if (!file.storageObjectId) continue
    if (file.keyVersion === 1) {
      // oxlint-disable-next-line no-await-in-loop -- fileごとのtenant/revision fenceを検証する。
      const deleted = await tx
        .delete(storageObjects)
        .where(
          and(
            eq(storageObjects.id, file.storageObjectId),
            eq(storageObjects.organizationId, input.organizationId),
            eq(storageObjects.keyVersion, 1),
            eq(storageObjects.objectKey, file.objectKey)
          )
        )
        .returning({ id: storageObjects.id })
      if (!deleted[0]) {
        throw new Error("Legacy storage object release lost its fence")
      }
      continue
    }
    if (file.keyVersion !== 2) {
      throw new Error("Unknown storage object key version")
    }

    // oxlint-disable-next-line no-await-in-loop -- cleanup revisionをrowごとに取得する。
    const deleting = await tx
      .update(storageObjects)
      .set({
        cleanupRevision: sql`${storageObjects.cleanupRevision} + 1`,
        status: "deleting",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(storageObjects.id, file.storageObjectId),
          eq(storageObjects.organizationId, input.organizationId),
          eq(storageObjects.keyVersion, 2),
          eq(storageObjects.status, "ready"),
          eq(storageObjects.objectKey, file.objectKey)
        )
      )
      .returning({
        cleanupRevision: storageObjects.cleanupRevision,
        objectKey: storageObjects.objectKey,
      })
    const storage = deleting[0]
    if (!storage?.objectKey) {
      throw new Error("V2 storage object release lost its fence")
    }
    // oxlint-disable-next-line no-await-in-loop -- exact cleanup jobも同じfile transactionへ入れる。
    await tx.insert(storageObjectCleanupJobs).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      storageObjectId: file.storageObjectId,
      expectedCleanupRevision: storage.cleanupRevision,
      objectKey: storage.objectKey,
      status: "pending",
      createdAt: input.now,
    })
  }
}

export const isLegacyFileStorage = (file: DeletedFileStorageSnapshot) =>
  file.storageObjectId === null || file.keyVersion !== 2
