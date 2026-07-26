import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  invitation,
  invitationEmailJobs,
  member,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import { toOrganizationInvitation } from "./domain"
import {
  errorChainText,
  invitationLifetimeMs,
  invitationResendRecipientConflict,
  withInvitationLock,
} from "./repository-support"

export const resendInvitationById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    invitationId: string
  }
) => {
  try {
    return await withInvitationLock(
      `${input.organizationId}:invitation:${input.invitationId}`,
      () =>
        db.transaction(async (tx) => {
          const existingRows = await tx
            .select()
            .from(invitation)
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                eq(invitation.id, input.invitationId)
              )
            )
            .limit(1)
          const existing = existingRows[0]
          if (!existing) {
            return { kind: "not_found" as const }
          }
          if (
            (existing.status !== "pending" && existing.status !== "expired") ||
            (existing.role !== "admin" && existing.role !== "member")
          ) {
            return { kind: "not_resendable" as const }
          }

          const actorRows = await tx
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              profileImage: user.image,
              role: member.role,
            })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(
              and(
                eq(member.organizationId, input.organizationId),
                eq(member.userId, input.actorUserId)
              )
            )
            .limit(1)
          const actor = actorRows[0]
          if (!actor) {
            return { kind: "actor_not_member" as const }
          }
          if (
            (existing.role === "admin" && actor.role !== "super_admin") ||
            (existing.role === "member" &&
              actor.role !== "super_admin" &&
              actor.role !== "admin")
          ) {
            return { kind: "actor_forbidden" as const }
          }

          const existingMemberRows = await tx
            .select({ id: member.id })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(
              and(
                eq(member.organizationId, input.organizationId),
                eq(
                  sql<string>`lower(${user.email})`,
                  existing.email.toLowerCase()
                )
              )
            )
            .limit(1)
          if (existingMemberRows[0]) {
            throw invitationResendRecipientConflict()
          }

          const now = new Date()
          const otherPendingRows = await tx
            .select({
              id: invitation.id,
              expiresAt: invitation.expiresAt,
            })
            .from(invitation)
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                ne(invitation.id, input.invitationId),
                eq(invitation.status, "pending"),
                eq(
                  sql<string>`lower(${invitation.email})`,
                  existing.email.toLowerCase()
                )
              )
            )
          if (
            otherPendingRows.some(
              ({ expiresAt }) => expiresAt.getTime() > now.getTime()
            )
          ) {
            throw invitationResendRecipientConflict()
          }
          const otherExpiredIds = otherPendingRows.map(({ id }) => id)
          if (otherExpiredIds.length > 0) {
            await tx
              .update(invitation)
              .set({ status: "expired" })
              .where(
                and(
                  eq(invitation.organizationId, input.organizationId),
                  inArray(invitation.id, otherExpiredIds),
                  eq(invitation.status, "pending")
                )
              )
            await tx
              .update(invitationEmailJobs)
              .set({
                status: "canceled",
                completedAt: now,
                lockedAt: null,
                nextAttemptAt: null,
              })
              .where(
                and(
                  inArray(invitationEmailJobs.invitationId, otherExpiredIds),
                  inArray(invitationEmailJobs.status, [
                    "pending",
                    "failed",
                    "processing",
                  ])
                )
              )
          }

          const revived =
            existing.status === "expired" ||
            existing.expiresAt.getTime() <= now.getTime()
          const updatedRows = await tx
            .update(invitation)
            .set({
              status: "pending",
              expiresAt: new Date(now.getTime() + invitationLifetimeMs),
              inviterId: input.actorUserId,
            })
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                eq(invitation.id, input.invitationId)
              )
            )
            .returning()
          const updated = updatedRows[0]
          if (!updated) {
            return { kind: "not_found" as const }
          }

          const jobRows = await tx
            .select({ id: invitationEmailJobs.id })
            .from(invitationEmailJobs)
            .where(eq(invitationEmailJobs.invitationId, input.invitationId))
            .limit(1)
          if (jobRows[0]) {
            await tx
              .update(invitationEmailJobs)
              .set({
                status: "pending",
                lastErrorCode: null,
                lockedAt: null,
                nextAttemptAt: null,
                completedAt: null,
              })
              .where(eq(invitationEmailJobs.id, jobRows[0].id))
          } else {
            await tx.insert(invitationEmailJobs).values({
              id: crypto.randomUUID(),
              invitationId: input.invitationId,
            })
          }

          await tx.insert(auditLogs).values({
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            actorUserId: input.actorUserId,
            action: "organization.invitation.resent",
            targetType: "invitation",
            targetId: input.invitationId,
            metadata: { revived, role: existing.role },
          })

          return {
            kind: "resent" as const,
            invitation: toOrganizationInvitation(updated, {
              id: actor.id,
              name: actor.name,
              email: actor.email,
              profileImage: actor.profileImage,
            }),
            revived,
          }
        })
    )
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause
    }
    const details = errorChainText(cause)
    if (
      details.includes("invitation_pending_organization_email_uidx") ||
      details.includes("invitation.organization_id, lower(email)")
    ) {
      throw invitationResendRecipientConflict()
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "resendInvitationById",
    })
  }
}

export const cancelInvitationById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    invitationId: string
  }
) => {
  try {
    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, input.organizationId),
            eq(invitation.id, input.invitationId)
          )
        )
        .limit(1)
      const existing = existingRows[0]
      if (!existing) {
        return { kind: "not_found" as const }
      }
      if (
        existing.status !== "pending" ||
        existing.expiresAt.getTime() <= Date.now()
      ) {
        if (existing.status === "pending") {
          await tx
            .update(invitation)
            .set({ status: "expired" })
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                eq(invitation.id, input.invitationId),
                eq(invitation.status, "pending")
              )
            )
        }
        await tx
          .update(invitationEmailJobs)
          .set({
            status: "canceled",
            completedAt: new Date(),
            lockedAt: null,
            nextAttemptAt: null,
          })
          .where(
            and(
              eq(invitationEmailJobs.invitationId, input.invitationId),
              inArray(invitationEmailJobs.status, [
                "pending",
                "failed",
                "processing",
              ])
            )
          )
        return { kind: "not_pending" as const }
      }

      const updatedRows = await tx
        .update(invitation)
        .set({ status: "canceled" })
        .where(
          and(
            eq(invitation.organizationId, input.organizationId),
            eq(invitation.id, input.invitationId),
            eq(invitation.status, "pending")
          )
        )
        .returning()
      const updated = updatedRows[0]
      if (!updated) {
        return { kind: "not_pending" as const }
      }
      await tx
        .update(invitationEmailJobs)
        .set({
          status: "canceled",
          completedAt: new Date(),
          lockedAt: null,
          nextAttemptAt: null,
        })
        .where(
          and(
            eq(invitationEmailJobs.invitationId, input.invitationId),
            inArray(invitationEmailJobs.status, [
              "pending",
              "failed",
              "processing",
            ])
          )
        )
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "organization.invitation.canceled",
        targetType: "invitation",
        targetId: input.invitationId,
        metadata: {},
      })

      return { kind: "canceled" as const, invitation: updated }
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "cancelInvitationById",
    })
  }
}
