import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  files,
  issueFileOwners,
  member,
  organizationFileUsage,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, lt, lte, or, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import type { OrganizationRole } from "../authorization/public"
import {
  ORGANIZATION_FILE_QUOTA_BYTES,
  isPreviewableImageFormat,
  isTextPreviewableFile,
  type FileOwnerType,
  type PreviewableImageFormat,
} from "./constants"
import { decodeFileCursor, encodeFileCursor } from "./cursor"
import { deleteReadyFilesInTransaction } from "./file-deletion-transaction"
import type { FileDto, FileListDto } from "./model"
import { getFileOwnerAdapter } from "./owner-adapters"

export type StoredFile = typeof files.$inferSelect

type FileRow = {
  stored: StoredFile
  ownerId: string
  uploaderName: string | null
  uploaderProfileImage: string | null
}

export type FileWithOwner = StoredFile & { ownerId: string }
export { deleteReadyFilesInTransaction }

const fileSelection = {
  stored: files,
  ownerId: issueFileOwners.issueId,
  uploaderName: user.name,
  uploaderProfileImage: user.image,
}

const toFileDto = (
  row: FileRow,
  actor: { role: OrganizationRole; userId: string }
): FileDto => ({
  id: row.stored.id,
  owner: { type: row.stored.ownerType, id: row.ownerId },
  filename: row.stored.filename,
  sizeBytes: row.stored.sizeBytes,
  declaredContentType: row.stored.declaredContentType,
  previewable: isPreviewableImageFormat(row.stored.detectedImageFormat),
  textPreviewable: isTextPreviewableFile(row.stored),
  imageWidth: row.stored.imageWidth,
  imageHeight: row.stored.imageHeight,
  uploader: {
    id: row.stored.uploaderId,
    name: row.uploaderName ?? "Former member",
    profileImage: row.uploaderProfileImage,
  },
  createdAt: row.stored.createdAt.toISOString(),
  canDelete: row.stored.uploaderId === actor.userId || actor.role !== "member",
})

const baseFileQuery = (db: Pick<Db, "select">) =>
  db
    .select(fileSelection)
    .from(files)
    .innerJoin(
      issueFileOwners,
      and(
        eq(issueFileOwners.fileId, files.id),
        eq(issueFileOwners.organizationId, files.organizationId),
        eq(issueFileOwners.ownerType, files.ownerType)
      )
    )
    .leftJoin(
      member,
      and(
        eq(member.organizationId, files.organizationId),
        eq(member.userId, files.uploaderId)
      )
    )
    .leftJoin(user, eq(user.id, member.userId))

const errorDiagnostic = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  return messages.join(" ")
}

const isUploadIdUniqueConflict = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("files_organization_upload_uidx") ||
    diagnostic.includes("files.organization_id, files.upload_id")
  )
}

const isDatabaseWriteContention = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("SQLITE_BUSY") || diagnostic.includes("SQLITE_LOCKED")
  )
}

/** @internal */
export const findFileByUploadId = async (
  db: Db,
  input: { organizationId: string; uploadId: string }
): Promise<FileWithOwner | null> => {
  const rows = await baseFileQuery(db)
    .where(
      and(
        eq(files.organizationId, input.organizationId),
        eq(files.uploadId, input.uploadId)
      )
    )
    .limit(1)
  const row = rows[0]
  return row ? { ...row.stored, ownerId: row.ownerId } : null
}

export const findReadyFileById = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
  }
): Promise<{ dto: FileDto; stored: FileWithOwner } | null> => {
  const rows = await baseFileQuery(db)
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.organizationId, input.organizationId),
        eq(files.status, "ready")
      )
    )
    .limit(1)
  const row = rows[0]
  return row
    ? {
        dto: toFileDto(row, {
          role: input.actorRole,
          userId: input.actorUserId,
        }),
        stored: { ...row.stored, ownerId: row.ownerId },
      }
    : null
}

export const listReadyFilesByOwner = async (
  db: Pick<Db, "select">,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    cursor?: string
    limit: number
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
  }
): Promise<FileListDto> => {
  let cursor: ReturnType<typeof decodeFileCursor> | undefined
  if (input.cursor) {
    try {
      cursor = decodeFileCursor(input.cursor)
    } catch (cause) {
      throw new HttpError({ code: "validation_error", cause })
    }
  }

  const conditions = [
    eq(files.organizationId, input.organizationId),
    eq(files.ownerType, input.ownerType),
    eq(issueFileOwners.issueId, input.ownerId),
    eq(files.status, "ready"),
  ]
  if (cursor) {
    const cursorCondition = or(
      lt(files.createdAt, cursor.createdAt),
      and(eq(files.createdAt, cursor.createdAt), lt(files.id, cursor.id))
    )
    if (cursorCondition) conditions.push(cursorCondition)
  }

  const rows = await baseFileQuery(db)
    .where(and(...conditions))
    .orderBy(desc(files.createdAt), desc(files.id))
    .limit(input.limit + 1)
  const hasMore = rows.length > input.limit
  const page = rows.slice(0, input.limit)
  const oldest = page.at(-1)
  return {
    items: page.map((row) =>
      toFileDto(row, {
        role: input.actorRole,
        userId: input.actorUserId,
      })
    ),
    nextCursor:
      hasMore && oldest
        ? encodeFileCursor({
            createdAt: oldest.stored.createdAt,
            id: oldest.stored.id,
          })
        : null,
  }
}

export const reservePendingFile = async (
  db: Db,
  input: {
    declaredContentType: string
    detectedImageFormat: PreviewableImageFormat | "avif" | null
    fileId: string
    filename: string
    objectKey: string
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
    sizeBytes: number
    uploaderId: string
    uploadId: string
  }
): Promise<{ created: boolean; file: FileWithOwner }> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded retryは同じreservationを逐次再実行する。
      return await db.transaction(async (tx) => {
        const existingRows = await tx
          .select({ stored: files, ownerId: issueFileOwners.issueId })
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
              eq(files.organizationId, input.organizationId),
              eq(files.uploadId, input.uploadId)
            )
          )
          .limit(1)
        const existing = existingRows[0]
        if (existing) {
          return {
            created: false,
            file: { ...existing.stored, ownerId: existing.ownerId },
          }
        }

        const usageRows = await tx
          .insert(organizationFileUsage)
          .values({
            organizationId: input.organizationId,
            usedBytes: input.sizeBytes,
          })
          .onConflictDoUpdate({
            target: organizationFileUsage.organizationId,
            set: {
              usedBytes: sql`${organizationFileUsage.usedBytes} + ${input.sizeBytes}`,
              updatedAt: new Date(),
            },
            setWhere: lte(
              organizationFileUsage.usedBytes,
              ORGANIZATION_FILE_QUOTA_BYTES - input.sizeBytes
            ),
          })
          .returning({ usedBytes: organizationFileUsage.usedBytes })
        if (!usageRows[0]) {
          throw new HttpError({ code: "conflict" })
        }

        const insertedRows = await tx
          .insert(files)
          .values({
            id: input.fileId,
            organizationId: input.organizationId,
            uploaderId: input.uploaderId,
            uploadId: input.uploadId,
            ownerType: input.ownerType,
            objectKey: input.objectKey,
            filename: input.filename,
            sizeBytes: input.sizeBytes,
            declaredContentType: input.declaredContentType,
            detectedImageFormat: input.detectedImageFormat,
            status: "pending",
          })
          .returning()
        const inserted = insertedRows[0]
        if (!inserted) throw new Error("Pending file insert returned no row")

        const ownerRow = getFileOwnerAdapter(input.ownerType).ownerRow({
          fileId: input.fileId,
          organizationId: input.organizationId,
          ownerId: input.ownerId,
        })
        await tx.insert(issueFileOwners).values(ownerRow)
        return {
          created: true,
          file: { ...inserted, ownerId: input.ownerId },
        }
      })
    } catch (cause) {
      if (isDatabaseWriteContention(cause) && attempt < 3) {
        // oxlint-disable-next-line no-await-in-loop -- bounded backoffでlocal libSQLの同時writeを収束させる。
        await new Promise((resolve) => setTimeout(resolve, attempt + 1))
        continue
      }
      if (isUploadIdUniqueConflict(cause)) {
        // oxlint-disable-next-line no-await-in-loop -- unique競合後にcommitted winnerだけを取得する。
        const existing = await findFileByUploadId(db, {
          organizationId: input.organizationId,
          uploadId: input.uploadId,
        })
        if (existing) return { created: false, file: existing }
      }
      throw cause
    }
  }
  throw new Error("File reservation retries exhausted")
}

export const finalizePendingFile = async (
  db: Db,
  input: {
    actorUserId: string
    etag: string
    file: FileWithOwner
    imageHeight: number | null
    imageWidth: number | null
  }
): Promise<void> => {
  await db.transaction(async (tx) => {
    const readyAt = new Date()
    const rows = await tx
      .update(files)
      .set({
        etag: input.etag,
        imageHeight: input.imageHeight,
        imageWidth: input.imageWidth,
        status: "ready",
        updatedAt: readyAt,
      })
      .where(
        and(
          eq(files.id, input.file.id),
          eq(files.organizationId, input.file.organizationId),
          eq(files.status, "pending")
        )
      )
      .returning({ id: files.id })
    if (!rows[0]) {
      const ready = await tx
        .select({ id: files.id })
        .from(files)
        .where(
          and(
            eq(files.id, input.file.id),
            eq(files.organizationId, input.file.organizationId),
            eq(files.status, "ready")
          )
        )
        .limit(1)
      if (ready[0]) return
      throw new Error("Pending file no longer exists")
    }
    await getFileOwnerAdapter(input.file.ownerType).recordActivity(tx, {
      actorUserId: input.actorUserId,
      fileId: input.file.id,
      filename: input.file.filename,
      kind: "file_added",
      occurredAt: readyAt,
      organizationId: input.file.organizationId,
      ownerId: input.file.ownerId,
    })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: input.file.organizationId,
      actorUserId: input.actorUserId,
      action: "file.uploaded",
      targetType: "file",
      targetId: input.file.id,
      metadata: {},
    })
  })
}

export const deleteReadyFile = async (
  db: Db,
  input: { actorUserId: string; file: FileWithOwner }
): Promise<boolean> =>
  db.transaction((tx) =>
    deleteReadyFilesInTransaction(tx, {
      actorUserId: input.actorUserId,
      files: [input.file],
      now: new Date(),
    })
  )
