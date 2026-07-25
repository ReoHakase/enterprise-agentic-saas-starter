import type { Db } from "@enterprise-agentic-saas/db"
import {
  member,
  organization,
  profileImageCleanupJobs,
  profileImages,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt } from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import type { ProfileImageSubject } from "./constants"

export type StoredProfileImage = typeof profileImages.$inferSelect

export const preserveAppError = (cause: unknown, operation: string): never => {
  if (cause instanceof AppError) throw cause
  throw publicErrors.internal(cause, { module: "profile-images", operation })
}

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

export const isReservationConflict = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("profile_images_subject_upload_uidx") ||
    diagnostic.includes("profile_images_subject_version_uidx") ||
    diagnostic.includes(
      "profile_images.subject_type, profile_images.subject_id, profile_images.upload_id"
    ) ||
    diagnostic.includes(
      "profile_images.subject_type, profile_images.subject_id, profile_images.version"
    )
  )
}

export const isReservationLockContention = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED") ||
    diagnostic.includes("database is locked") ||
    diagnostic.includes("database table is locked")
  )
}

export const waitForReservationRetry = (attempt: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, Math.min(2 ** attempt, 16))
  })

export const subjectConditions = (subject: ProfileImageSubject) =>
  and(
    eq(profileImages.subjectType, subject.type),
    eq(profileImages.subjectId, subject.id)
  )

export const enqueueCleanup = async (
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  image: Pick<StoredProfileImage, "objectKey" | "subjectId" | "subjectType">
) => {
  await tx
    .insert(profileImageCleanupJobs)
    .values({
      id: crypto.randomUUID(),
      subjectType: image.subjectType,
      subjectId: image.subjectId,
      objectKey: image.objectKey,
    })
    .onConflictDoUpdate({
      target: profileImageCleanupJobs.objectKey,
      set: {
        completedAt: null,
        lastErrorCode: null,
        lockedAt: null,
        nextAttemptAt: null,
        status: "pending",
      },
    })
}

export const findProfileImageByUploadId = async (
  db: Db,
  input: { subject: ProfileImageSubject; uploadId: string }
): Promise<StoredProfileImage | null> => {
  try {
    const rows = await db
      .select()
      .from(profileImages)
      .where(
        and(
          subjectConditions(input.subject),
          eq(profileImages.uploadId, input.uploadId)
        )
      )
      .limit(1)
    return rows[0] ?? null
  } catch (cause) {
    return preserveAppError(cause, "findProfileImageByUploadId")
  }
}

export const findReadyProfileImage = async (
  db: Db,
  subject: ProfileImageSubject
): Promise<StoredProfileImage | null> => {
  try {
    const rows = await db
      .select()
      .from(profileImages)
      .where(and(subjectConditions(subject), eq(profileImages.status, "ready")))
      .limit(1)
    return rows[0] ?? null
  } catch (cause) {
    return preserveAppError(cause, "findReadyProfileImage")
  }
}

export const findSubjectFallback = async (
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  subject: ProfileImageSubject
) => {
  if (subject.type === "user") {
    const rows = await tx
      .select({ value: user.image })
      .from(user)
      .where(eq(user.id, subject.id))
      .limit(1)
    return rows[0]
  }
  const rows = await tx
    .select({ value: organization.logo })
    .from(organization)
    .where(eq(organization.id, subject.id))
    .limit(1)
  return rows[0]
}

export const normalizeFallbackUrl = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return normalized && normalized.length <= 2048 ? normalized : null
}

export const assertOrganizationMutationAuthorized = async (
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  input: {
    action:
      | "organization.profile_image.delete"
      | "organization.profile_image.update"
    actorUserId: string
    sessionId?: string
    subject: ProfileImageSubject
  }
) => {
  if (input.subject.type !== "organization") return

  const memberships = await tx
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, input.actorUserId),
        eq(member.organizationId, input.subject.id)
      )
    )
    .limit(1)
  const membership = memberships[0]
  if (!membership) {
    throw publicErrors.notFound("Organization not found", {
      resource: "organization",
    })
  }
  if (!input.sessionId) {
    throw publicErrors.activeOrganizationMismatch()
  }
  const activeSessions = await tx
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, input.sessionId),
        eq(session.userId, input.actorUserId),
        eq(session.activeOrganizationId, input.subject.id),
        gt(session.expiresAt, new Date())
      )
    )
    .limit(1)
  if (!activeSessions[0]) {
    throw publicErrors.activeOrganizationMismatch()
  }
  if (membership.role !== "super_admin") {
    throw publicErrors.forbidden("You are not allowed to perform this action", {
      action: input.action,
    })
  }
}
