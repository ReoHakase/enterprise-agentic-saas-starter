import type { Db } from "@enterprise-agentic-saas/db"
import {
  member,
  organization,
  organizationDeletionJobs,
  session,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt } from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import { ensureAgentSessionContextInTransaction } from "../agent/public"
import {
  toOrganizationDeletionReceipt,
  type OrganizationDeletionReceipt,
} from "./domain"
import { isDeletionRequestConflict } from "./repository-support"

export const findOrganizationDeletionReceipt = async (
  db: Db,
  input: {
    actorUserId: string
    idempotencyKey: string
    organizationId: string
  }
): Promise<OrganizationDeletionReceipt | null> => {
  try {
    const rows = await db
      .select({
        id: organizationDeletionJobs.id,
        organizationId: organizationDeletionJobs.organizationId,
      })
      .from(organizationDeletionJobs)
      .where(
        and(
          eq(organizationDeletionJobs.requestedByUserId, input.actorUserId),
          eq(organizationDeletionJobs.organizationId, input.organizationId),
          eq(organizationDeletionJobs.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1)

    return rows[0] ? toOrganizationDeletionReceipt(rows[0]) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "findOrganizationDeletionReceipt",
    })
  }
}

export type DeleteOrganizationResult =
  | { kind: "active_organization_mismatch" }
  | { kind: "deleted"; receipt: OrganizationDeletionReceipt }
  | { kind: "forbidden" }
  | { kind: "idempotency_conflict" }
  | { kind: "not_found" }
  | { kind: "slug_mismatch" }

export const deleteOrganizationById = async (
  db: Db,
  input: {
    actorUserId: string
    idempotencyKey: string
    organizationId: string
    sessionId: string
    slug: string
  }
): Promise<DeleteOrganizationResult> => {
  try {
    return await db.transaction(async (tx) => {
      const existingJobs = await tx
        .select({
          id: organizationDeletionJobs.id,
          organizationId: organizationDeletionJobs.organizationId,
        })
        .from(organizationDeletionJobs)
        .where(
          and(
            eq(organizationDeletionJobs.requestedByUserId, input.actorUserId),
            eq(organizationDeletionJobs.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1)
      const existingJob = existingJobs[0]
      if (existingJob) {
        return existingJob.organizationId === input.organizationId
          ? {
              kind: "deleted" as const,
              receipt: toOrganizationDeletionReceipt(existingJob),
            }
          : { kind: "idempotency_conflict" as const }
      }

      // guard/service後のrole変更やactive organization切替とのraceでも、
      // destructive mutation直前のtransactionを認可の最終防波堤にする。
      const memberships = await tx
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.userId, input.actorUserId),
            eq(member.organizationId, input.organizationId)
          )
        )
        .limit(1)
      const membership = memberships[0]
      if (!membership) {
        return { kind: "not_found" as const }
      }
      if (membership.role !== "super_admin") {
        return { kind: "forbidden" as const }
      }

      const activeSessions = await tx
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.id, input.sessionId),
            eq(session.userId, input.actorUserId),
            eq(session.activeOrganizationId, input.organizationId),
            gt(session.expiresAt, new Date())
          )
        )
        .limit(1)
      if (!activeSessions[0]) {
        return { kind: "active_organization_mismatch" as const }
      }

      const organizations = await tx
        .select({ id: organization.id, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1)
      const target = organizations[0]
      if (!target) {
        return { kind: "not_found" as const }
      }
      if (target.slug !== input.slug) {
        return { kind: "slug_mismatch" as const }
      }

      const deletionId = crypto.randomUUID()
      await tx.insert(organizationDeletionJobs).values({
        id: deletionId,
        organizationId: input.organizationId,
        requestedByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      })

      const affectedSessions = await tx
        .select({ sessionId: session.id, userId: session.userId })
        .from(session)
        .where(eq(session.activeOrganizationId, input.organizationId))
      const now = new Date()
      for (const context of affectedSessions) {
        // oxlint-disable-next-line no-await-in-loop -- session update trigger前に全context rowを同一transactionで用意する。
        await ensureAgentSessionContextInTransaction(tx, { ...context, now })
      }
      await tx
        .update(session)
        .set({ activeOrganizationId: null, updatedAt: now })
        .where(eq(session.activeOrganizationId, input.organizationId))

      const deletedRows = await tx
        .delete(organization)
        .where(eq(organization.id, input.organizationId))
        .returning({ id: organization.id })
      if (!deletedRows[0]) {
        throw publicErrors.notFound("Organization not found", {
          resource: "organization",
        })
      }

      return {
        kind: "deleted" as const,
        receipt: toOrganizationDeletionReceipt({
          id: deletionId,
          organizationId: input.organizationId,
        }),
      }
    })
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause
    }
    if (isDeletionRequestConflict(cause)) {
      const existing = await findOrganizationDeletionReceipt(db, input)
      if (existing) {
        return { kind: "deleted", receipt: existing }
      }
      return { kind: "idempotency_conflict" }
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "deleteOrganizationById",
    })
  }
}
