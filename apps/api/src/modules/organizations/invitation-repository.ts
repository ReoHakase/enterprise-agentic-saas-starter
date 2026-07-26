import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  invitation,
  invitationEmailJobs,
  member,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import { type OrganizationRole } from "../authorization/public"
import { toOrganizationInvitation, type OrganizationInvitation } from "./domain"
import {
  errorChainText,
  invitationEmailConflict,
  invitationLifetimeMs,
  orderedUniqueKeys,
  withInvitationLocks,
} from "./repository-support"

export const listInvitationsByOrganization = async (
  db: Db,
  organizationId: string
): Promise<OrganizationInvitation[]> => {
  try {
    const rows = await db
      .select({
        invitation,
        inviter: {
          id: user.id,
          name: user.name,
          email: user.email,
          profileImage: user.image,
        },
      })
      .from(invitation)
      .innerJoin(user, eq(invitation.inviterId, user.id))
      .where(eq(invitation.organizationId, organizationId))
      .orderBy(invitation.createdAt)

    return rows.map(({ invitation: row, inviter }) =>
      toOrganizationInvitation(row, inviter)
    )
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "listInvitationsByOrganization",
    })
  }
}

export const insertInvitations = async (
  db: Db,
  input: {
    organizationId: string
    inviterId: string
    emails: readonly string[]
    role: Exclude<OrganizationRole, "super_admin">
  }
): Promise<OrganizationInvitation[]> => {
  try {
    const lockKeys = orderedUniqueKeys(
      input.emails.map((email) => `${input.organizationId}:${email}`)
    )
    const result = await withInvitationLocks(lockKeys, () =>
      db.transaction(async (tx) => {
        const inviterRows = await tx
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            profileImage: user.image,
          })
          .from(user)
          .where(eq(user.id, input.inviterId))
          .limit(1)
        const inviter = inviterRows[0]
        if (!inviter) {
          throw new Error("Invitation inviter was not found")
        }
        const existingMembers = await tx
          .select({ id: member.id })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(
            and(
              eq(member.organizationId, input.organizationId),
              inArray(sql<string>`lower(${user.email})`, input.emails)
            )
          )
          .limit(1)
        if (existingMembers[0]) {
          throw invitationEmailConflict()
        }

        const pendingRows = await tx
          .select({ id: invitation.id, expiresAt: invitation.expiresAt })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, input.organizationId),
              eq(invitation.status, "pending"),
              inArray(sql<string>`lower(${invitation.email})`, input.emails)
            )
          )
        const now = new Date()
        const validPending = pendingRows.some(
          ({ expiresAt }) => expiresAt.getTime() > now.getTime()
        )
        if (validPending) {
          throw invitationEmailConflict()
        }
        const expiredIds = pendingRows.map(({ id }) => id)
        if (expiredIds.length > 0) {
          await tx
            .update(invitation)
            .set({ status: "expired" })
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                inArray(invitation.id, expiredIds)
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
                inArray(invitationEmailJobs.invitationId, expiredIds),
                inArray(invitationEmailJobs.status, [
                  "pending",
                  "failed",
                  "processing",
                ])
              )
            )
        }

        const expiresAt = new Date(now.getTime() + invitationLifetimeMs)
        const invitationValues = input.emails.map((email) => ({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          inviterId: input.inviterId,
          email,
          role: input.role,
          status: "pending",
          expiresAt,
        }))
        const insertedRows = await tx
          .insert(invitation)
          .values(invitationValues)
          .returning()
        if (insertedRows.length !== input.emails.length) {
          throw new Error("Invitation batch insert returned missing rows")
        }
        await tx.insert(auditLogs).values(
          insertedRows.map((row) => ({
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            actorUserId: input.inviterId,
            action: "organization.invitation.created",
            targetType: "invitation",
            targetId: row.id,
            metadata: { role: input.role },
          }))
        )
        await tx.insert(invitationEmailJobs).values(
          insertedRows.map((row) => ({
            id: crypto.randomUUID(),
            invitationId: row.id,
          }))
        )
        const rowByEmail = new Map(
          insertedRows.map((row) => [row.email.toLowerCase(), row])
        )
        const orderedRows = input.emails.map((email) => {
          const row = rowByEmail.get(email)
          if (!row) {
            throw new Error("Invitation batch ordering failed")
          }
          return row
        })
        return { inviter, rows: orderedRows }
      })
    )

    return result.rows.map((row) =>
      toOrganizationInvitation(row, result.inviter)
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
      throw invitationEmailConflict()
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "insertInvitations",
    })
  }
}

export const findInvitationForResend = async (
  db: Db,
  input: { organizationId: string; invitationId: string }
) => {
  try {
    const rows = await db
      .select({
        id: invitation.id,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, input.organizationId),
          eq(invitation.id, input.invitationId)
        )
      )
      .limit(1)

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "findInvitationForResend",
    })
  }
}
