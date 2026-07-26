import type { Db } from "@enterprise-agentic-saas/db"
import {
  invitation,
  invitationEmailJobs,
  organization,
  user,
} from "@enterprise-agentic-saas/db/schema"
import {
  EmailDeliveryError,
  MailpitDeliveryError,
  renderOrganizationInvitationEmail,
  type SendEmail,
} from "@enterprise-agentic-saas/email"
import { createRuntimeEmailSender } from "@enterprise-agentic-saas/email/runtime"
import { and, asc, eq, isNotNull, lte, or, sql } from "drizzle-orm"

import { env } from "../../platform/env"

const deliveryBatchSize = 25
const deliveryLeaseMs = 5 * 60 * 1000
const retryBaseMs = 30 * 1000
const retryMaximumMs = 60 * 60 * 1000

const configuredSendEmail = createRuntimeEmailSender({
  provider: env.EMAIL_PROVIDER,
  runtime: env.NODE_ENV,
  from: env.EMAIL_FROM,
  fromName: env.APP_NAME,
  mailpitUrl: env.MAILPIT_URL,
})

export type InvitationEmailJobRunResult = {
  claimed: number
  completed: number
  failed: number
  canceled: number
  stale: number
}

export type InvitationEmailJobFailure = {
  attempts: number
  errorCode: string
  retryable: boolean
}

type InvitationEmailJobOutcome =
  | "completed"
  | "failed"
  | "canceled"
  | "skipped"
  | "stale"

type RenderInvitationEmail = typeof renderOrganizationInvitationEmail

const retryDelayMs = (attempt: number) =>
  Math.min(retryBaseMs * 2 ** Math.max(0, attempt - 1), retryMaximumMs)

const safeDeliveryFailure = (cause: unknown) => {
  if (
    cause instanceof EmailDeliveryError ||
    cause instanceof MailpitDeliveryError
  ) {
    return {
      errorCode: cause.code,
      retryable: cause.retryable,
    }
  }

  return { errorCode: "email_delivery_failed", retryable: true }
}

export const processInvitationEmailJobs = async ({
  appBaseUrl = env.APP_BASE_URL,
  appName = env.APP_NAME,
  database,
  now = new Date(),
  onFailure,
  renderEmail = renderOrganizationInvitationEmail,
  sendEmail = configuredSendEmail,
}: {
  appBaseUrl?: string
  appName?: string
  database: Db
  now?: Date
  onFailure?: (failure: InvitationEmailJobFailure) => void
  renderEmail?: RenderInvitationEmail
  sendEmail?: SendEmail
}): Promise<InvitationEmailJobRunResult> => {
  const staleLease = new Date(now.getTime() - deliveryLeaseMs)
  const retryIsReady = and(
    isNotNull(invitationEmailJobs.nextAttemptAt),
    lte(invitationEmailJobs.nextAttemptAt, now)
  )
  const claimable = or(
    eq(invitationEmailJobs.status, "pending"),
    and(eq(invitationEmailJobs.status, "failed"), retryIsReady),
    and(
      eq(invitationEmailJobs.status, "processing"),
      lte(invitationEmailJobs.lockedAt, staleLease)
    )
  )
  const eligible = await database
    .select({ id: invitationEmailJobs.id })
    .from(invitationEmailJobs)
    .where(claimable)
    .orderBy(asc(invitationEmailJobs.createdAt))
    .limit(deliveryBatchSize)

  const outcomes = await Promise.all(
    eligible.map(async ({ id }): Promise<InvitationEmailJobOutcome> => {
      const claimedRows = await database
        .update(invitationEmailJobs)
        .set({
          status: "processing",
          attempts: sql`${invitationEmailJobs.attempts} + 1`,
          lockedAt: now,
          lastErrorCode: null,
          nextAttemptAt: null,
        })
        .where(and(eq(invitationEmailJobs.id, id), claimable))
        .returning({ attempts: invitationEmailJobs.attempts })
      const claimed = claimedRows[0]
      if (!claimed) {
        return "skipped"
      }

      const ownsLease = and(
        eq(invitationEmailJobs.id, id),
        eq(invitationEmailJobs.status, "processing"),
        eq(invitationEmailJobs.attempts, claimed.attempts),
        eq(invitationEmailJobs.lockedAt, now)
      )
      const deliveryRows = await database
        .select({
          email: invitation.email,
          expiresAt: invitation.expiresAt,
          invitationId: invitation.id,
          invitationStatus: invitation.status,
          inviterName: user.name,
          organizationName: organization.name,
        })
        .from(invitationEmailJobs)
        .innerJoin(
          invitation,
          eq(invitationEmailJobs.invitationId, invitation.id)
        )
        .innerJoin(organization, eq(invitation.organizationId, organization.id))
        .innerJoin(user, eq(invitation.inviterId, user.id))
        .where(and(eq(invitationEmailJobs.id, id), ownsLease))
        .limit(1)
      const delivery = deliveryRows[0]
      if (!delivery) {
        const errorCode = "delivery_context_missing"
        const failedRows = await database
          .update(invitationEmailJobs)
          .set({
            status: "failed",
            lastErrorCode: errorCode,
            lockedAt: null,
            nextAttemptAt: null,
          })
          .where(ownsLease)
          .returning({ id: invitationEmailJobs.id })
        if (!failedRows[0]) {
          return "stale"
        }
        try {
          onFailure?.({
            attempts: claimed.attempts,
            errorCode,
            retryable: false,
          })
        } catch {
          // Observability callbacks must not change durable delivery state.
        }
        return "failed"
      }

      if (
        delivery.invitationStatus !== "pending" ||
        delivery.expiresAt.getTime() <= now.getTime()
      ) {
        if (
          delivery.invitationStatus === "pending" &&
          delivery.expiresAt.getTime() <= now.getTime()
        ) {
          await database
            .update(invitation)
            .set({ status: "expired" })
            .where(
              and(
                eq(invitation.id, delivery.invitationId),
                eq(invitation.status, "pending"),
                lte(invitation.expiresAt, now)
              )
            )
        }
        const canceledRows = await database
          .update(invitationEmailJobs)
          .set({
            status: "canceled",
            completedAt: now,
            lockedAt: null,
            nextAttemptAt: null,
          })
          .where(ownsLease)
          .returning({ id: invitationEmailJobs.id })
        return canceledRows[0] ? "canceled" : "stale"
      }

      try {
        const rendered = await renderEmail({
          appName,
          organizationName: delivery.organizationName,
          invitationUrl: `${appBaseUrl}/invitations/${delivery.invitationId}`,
          inviterName: delivery.inviterName.trim() || undefined,
        })
        await sendEmail({ to: delivery.email, ...rendered })
        const completedRows = await database
          .update(invitationEmailJobs)
          .set({
            status: "completed",
            completedAt: now,
            lockedAt: null,
            nextAttemptAt: null,
          })
          .where(ownsLease)
          .returning({ id: invitationEmailJobs.id })
        return completedRows[0] ? "completed" : "stale"
      } catch (cause) {
        const failure = safeDeliveryFailure(cause)
        const failedRows = await database
          .update(invitationEmailJobs)
          .set({
            status: "failed",
            lastErrorCode: failure.errorCode,
            lockedAt: null,
            nextAttemptAt: failure.retryable
              ? new Date(now.getTime() + retryDelayMs(claimed.attempts))
              : null,
          })
          .where(ownsLease)
          .returning({ id: invitationEmailJobs.id })
        if (!failedRows[0]) {
          return "stale"
        }
        try {
          onFailure?.({ attempts: claimed.attempts, ...failure })
        } catch {
          // Observability callbacks must not change durable delivery state.
        }
        return "failed"
      }
    })
  )

  const completed = outcomes.filter((value) => value === "completed").length
  const failed = outcomes.filter((value) => value === "failed").length
  const canceled = outcomes.filter((value) => value === "canceled").length
  const stale = outcomes.filter((value) => value === "stale").length
  const claimed = outcomes.filter((value) => value !== "skipped").length
  return { claimed, completed, failed, canceled, stale }
}

export const processConfiguredInvitationEmailJobs = (database: Db) =>
  processInvitationEmailJobs({ database })
