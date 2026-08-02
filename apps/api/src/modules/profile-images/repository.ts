import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  organization,
  profileImages,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, gt, lt, lte, max } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import type { ProfileImageSubject } from "./constants"
import {
  assertOrganizationMutationAuthorized,
  enqueueCleanup,
  findProfileImageByUploadId,
  findSubjectFallback,
  isReservationConflict,
  isReservationLockContention,
  normalizeFallbackUrl,
  subjectConditions,
  waitForReservationRetry,
  type StoredProfileImage,
} from "./read-repository"

export {
  findReadyProfileImage,
  type StoredProfileImage,
} from "./read-repository"

export const reservePendingProfileImage = async (
  db: Db,
  input: {
    id: string
    objectKey: string
    sourceHash: string
    subject: ProfileImageSubject
    uploadId: string
  }
): Promise<{ created: boolean; image: StoredProfileImage }> => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded retryでsubject version競合を収束させる。
      return await db.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(profileImages)
          .where(
            and(
              subjectConditions(input.subject),
              eq(profileImages.uploadId, input.uploadId)
            )
          )
          .limit(1)
        const existing = existingRows[0]
        if (existing) return { created: false, image: existing }

        const subjectRow = await findSubjectFallback(tx, input.subject)
        if (!subjectRow) {
          throw new HttpError({ code: "not_found" })
        }

        const readyRows = await tx
          .select({ fallbackUrl: profileImages.fallbackUrl })
          .from(profileImages)
          .where(
            and(
              subjectConditions(input.subject),
              eq(profileImages.status, "ready")
            )
          )
          .limit(1)
        const versionRows = await tx
          .select({ value: max(profileImages.version) })
          .from(profileImages)
          .where(subjectConditions(input.subject))
        const version = (versionRows[0]?.value ?? 0) + 1

        const rows = await tx
          .insert(profileImages)
          .values({
            id: input.id,
            subjectType: input.subject.type,
            subjectId: input.subject.id,
            userId: input.subject.type === "user" ? input.subject.id : null,
            organizationId:
              input.subject.type === "organization" ? input.subject.id : null,
            uploadId: input.uploadId,
            sourceHash: input.sourceHash,
            version,
            objectKey: input.objectKey,
            fallbackUrl: normalizeFallbackUrl(
              readyRows[0]?.fallbackUrl ?? subjectRow.value
            ),
            status: "pending",
          })
          .returning()
        const image = rows[0]
        if (!image) throw new Error("Profile image insert returned no row")
        return { created: true, image }
      })
    } catch (cause) {
      if (cause instanceof HttpError) throw cause
      if (isReservationConflict(cause)) {
        // oxlint-disable-next-line no-await-in-loop -- committed winnerをretryごとに再確認する。
        const existing = await findProfileImageByUploadId(db, {
          subject: input.subject,
          uploadId: input.uploadId,
        })
        if (existing) return { created: false, image: existing }
        continue
      }
      if (isReservationLockContention(cause)) {
        // oxlint-disable-next-line no-await-in-loop -- transient SQLite lockを短いbounded backoffで収束させる。
        await waitForReservationRetry(attempt)
        continue
      }
      throw cause
    }
  }
  throw new Error("Profile image reservation retries exhausted")
}

export type FinalizeProfileImageResult =
  | { kind: "ready"; image: StoredProfileImage }
  | { kind: "superseded" }
  | { kind: "missing" }

export const finalizePendingProfileImage = async (
  db: Db,
  input: {
    actorUserId: string
    etag: string
    id: string
    profileImagePath: string
    sessionId?: string
    subject: ProfileImageSubject
  }
): Promise<FinalizeProfileImageResult> =>
  db.transaction(async (tx) => {
    await assertOrganizationMutationAuthorized(tx, {
      ...input,
      action: "organization.profile_image.update",
    })

    const rows = await tx
      .select()
      .from(profileImages)
      .where(
        and(eq(profileImages.id, input.id), subjectConditions(input.subject))
      )
      .limit(1)
    const image = rows[0]
    if (!image) return { kind: "missing" as const }
    if (image.status === "ready") {
      return { kind: "ready" as const, image }
    }
    if (image.status === "superseded") {
      return { kind: "superseded" as const }
    }

    const newerRows = await tx
      .select({ id: profileImages.id })
      .from(profileImages)
      .where(
        and(
          subjectConditions(input.subject),
          gt(profileImages.version, image.version)
        )
      )
      .orderBy(desc(profileImages.version))
      .limit(1)
    if (newerRows[0]) {
      const supersededRows = await tx
        .update(profileImages)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(
          and(
            eq(profileImages.id, image.id),
            eq(profileImages.status, "pending")
          )
        )
        .returning()
      if (supersededRows[0]) {
        await enqueueCleanup(tx, supersededRows[0])
      }
      return { kind: "superseded" as const }
    }

    const olderPendingRows = await tx
      .select()
      .from(profileImages)
      .where(
        and(
          subjectConditions(input.subject),
          eq(profileImages.status, "pending"),
          lt(profileImages.version, image.version)
        )
      )
    for (const olderPending of olderPendingRows) {
      // oxlint-disable-next-line no-await-in-loop -- idempotency tombstoneとcleanup enqueueを同じtransactionへ保存する。
      const supersededRows = await tx
        .update(profileImages)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(
          and(
            eq(profileImages.id, olderPending.id),
            eq(profileImages.status, "pending")
          )
        )
        .returning()
      const superseded = supersededRows[0]
      if (!superseded) continue
      // oxlint-disable-next-line no-await-in-loop -- cleanup jobのdurabilityを各objectへ保証する。
      await enqueueCleanup(tx, superseded)
    }

    const readyRows = await tx
      .select()
      .from(profileImages)
      .where(
        and(subjectConditions(input.subject), eq(profileImages.status, "ready"))
      )
      .limit(1)
    const previous = readyRows[0]
    if (previous) {
      const supersededRows = await tx
        .update(profileImages)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(
          and(
            eq(profileImages.id, previous.id),
            eq(profileImages.status, "ready")
          )
        )
        .returning()
      if (supersededRows[0]) {
        await enqueueCleanup(tx, supersededRows[0])
      }
    }

    const updatedAt = new Date()
    const updatedRows = await tx
      .update(profileImages)
      .set({ etag: input.etag, status: "ready", updatedAt })
      .where(
        and(eq(profileImages.id, image.id), eq(profileImages.status, "pending"))
      )
      .returning()
    const updated = updatedRows[0]
    if (!updated) return { kind: "missing" as const }

    if (input.subject.type === "user") {
      const subjectRows = await tx
        .update(user)
        .set({ image: input.profileImagePath, updatedAt })
        .where(eq(user.id, input.subject.id))
        .returning({ id: user.id })
      if (!subjectRows[0]) throw new Error("Profile image user disappeared")
    } else {
      const subjectRows = await tx
        .update(organization)
        .set({ logo: input.profileImagePath })
        .where(eq(organization.id, input.subject.id))
        .returning({ id: organization.id })
      if (!subjectRows[0]) {
        throw new Error("Profile image organization disappeared")
      }
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId: input.subject.id,
        actorUserId: input.actorUserId,
        action: "organization.profile_image.updated",
        targetType: "organization",
        targetId: input.subject.id,
        metadata: {},
      })
    }

    return { kind: "ready" as const, image: updated }
  })

export const deleteProfileImage = async (
  db: Db,
  input: {
    actorUserId: string
    sessionId?: string
    subject: ProfileImageSubject
  }
): Promise<boolean> =>
  db.transaction(async (tx) => {
    await assertOrganizationMutationAuthorized(tx, {
      ...input,
      action: "organization.profile_image.delete",
    })

    const rows = await tx
      .select()
      .from(profileImages)
      .where(subjectConditions(input.subject))
    const currentRows = rows.filter((image) => image.status !== "superseded")
    if (currentRows.length === 0) return false
    const ready = currentRows.find((image) => image.status === "ready")
    const fallbackUrl =
      ready?.fallbackUrl ??
      currentRows.toSorted((left, right) => right.version - left.version)[0]
        ?.fallbackUrl ??
      null

    await tx
      .update(profileImages)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          subjectConditions(input.subject),
          eq(profileImages.status, "pending")
        )
      )
    await tx
      .update(profileImages)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(subjectConditions(input.subject), eq(profileImages.status, "ready"))
      )
    for (const image of currentRows) {
      // oxlint-disable-next-line no-await-in-loop -- 1 transaction内でcleanup jobを順序付けて保存する。
      await enqueueCleanup(tx, image)
    }

    if (input.subject.type === "user") {
      const subjectRows = await tx
        .update(user)
        .set({ image: fallbackUrl, updatedAt: new Date() })
        .where(eq(user.id, input.subject.id))
        .returning({ id: user.id })
      if (!subjectRows[0]) throw new Error("Profile image user disappeared")
    } else {
      const subjectRows = await tx
        .update(organization)
        .set({ logo: fallbackUrl })
        .where(eq(organization.id, input.subject.id))
        .returning({ id: organization.id })
      if (!subjectRows[0]) {
        throw new Error("Profile image organization disappeared")
      }
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId: input.subject.id,
        actorUserId: input.actorUserId,
        action: "organization.profile_image.deleted",
        targetType: "organization",
        targetId: input.subject.id,
        metadata: {},
      })
    }
    return true
  })

export const supersedePendingProfileImage = async (
  db: Db,
  image: StoredProfileImage
) =>
  db.transaction(async (tx) => {
    const updatedRows = await tx
      .update(profileImages)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(eq(profileImages.id, image.id), eq(profileImages.status, "pending"))
      )
      .returning()
    if (updatedRows[0]) {
      await enqueueCleanup(tx, updatedRows[0])
      return true
    }

    const rows = await tx
      .select({ status: profileImages.status })
      .from(profileImages)
      .where(eq(profileImages.id, image.id))
      .limit(1)
    if (rows[0]) return false

    await enqueueCleanup(tx, image)
    return true
  })

export const expireStalePendingProfileImages = async (
  db: Db,
  input: { cutoff: Date; limit?: number }
) =>
  db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(profileImages)
      .where(
        and(
          eq(profileImages.status, "pending"),
          lte(profileImages.updatedAt, input.cutoff)
        )
      )
      .orderBy(profileImages.updatedAt)
      .limit(input.limit ?? 25)

    let expired = 0
    for (const image of rows) {
      // oxlint-disable-next-line no-await-in-loop -- stale tombstoneとcleanup jobを同じtransactionへ保存する。
      const updatedRows = await tx
        .update(profileImages)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(
          and(
            eq(profileImages.id, image.id),
            eq(profileImages.status, "pending"),
            lte(profileImages.updatedAt, input.cutoff)
          )
        )
        .returning()
      const updated = updatedRows[0]
      if (!updated) continue
      // oxlint-disable-next-line no-await-in-loop -- cleanup jobのdurabilityを各objectへ保証する。
      await enqueueCleanup(tx, updated)
      expired += 1
    }
    return expired
  })
