import type { Db } from "@enterprise-agentic-saas/db"
import { auditLogs, invitation } from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

export const cancelInvitationById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    invitationId: string
  }
) =>
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
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "organization.invitation.canceled",
      targetType: "invitation",
      targetId: input.invitationId,
      metadata: {},
    })

    return {
      kind: "canceled" as const,
      invitation: { id: updated.id, status: "canceled" as const },
    }
  })
