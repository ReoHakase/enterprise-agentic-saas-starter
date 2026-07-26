import type { Db } from "@enterprise-agentic-saas/db"
import { rateLimit } from "@enterprise-agentic-saas/db/schema"
import { sql } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"

const invitationQuotaWindowMs = 60 * 60 * 1000
const actorOrganizationMaximum = 30
const organizationMaximum = 100
const encoder = new TextEncoder()

const digest = async (value: string) => {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value))
  )
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

/** @internal */
export const invitationQuotaKey = async (
  scope: "actor_organization" | "organization",
  identifiers: readonly string[]
) => `app:invitation:v1:${scope}:${await digest(JSON.stringify(identifiers))}`

type QuotaReservation = {
  count: number
  lastRequest: number
  maximum: number
}

export const reserveInvitationQuota = async (
  database: Db,
  input: {
    actorUserId: string
    organizationId: string
    recipientCount: number
    now?: Date
  }
): Promise<void> => {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const windowStart = nowMs - invitationQuotaWindowMs
  const [actorOrganizationKey, organizationKey] = await Promise.all([
    invitationQuotaKey("actor_organization", [
      input.actorUserId,
      input.organizationId,
    ]),
    invitationQuotaKey("organization", [input.organizationId]),
  ])

  let reservations: QuotaReservation[]
  try {
    reservations = await database.transaction(async (tx) => {
      const reserve = async (
        key: string,
        maximum: number
      ): Promise<QuotaReservation> => {
        const rows = await tx
          .insert(rateLimit)
          .values({
            id: crypto.randomUUID(),
            key,
            count: input.recipientCount,
            lastRequest: nowMs,
          })
          .onConflictDoUpdate({
            target: rateLimit.key,
            set: {
              count: sql`case
                when ${rateLimit.lastRequest} <= ${windowStart}
                then ${input.recipientCount}
                else ${rateLimit.count} + ${input.recipientCount}
              end`,
              lastRequest: sql`case
                when ${rateLimit.lastRequest} <= ${windowStart}
                then ${nowMs}
                else ${rateLimit.lastRequest}
              end`,
            },
          })
          .returning({
            count: rateLimit.count,
            lastRequest: rateLimit.lastRequest,
          })
        const row = rows[0]
        if (!row) {
          throw new Error("Invitation quota reservation returned no row")
        }
        return { ...row, maximum }
      }

      const actorOrganization = await reserve(
        actorOrganizationKey,
        actorOrganizationMaximum
      )
      const organization = await reserve(organizationKey, organizationMaximum)
      return [actorOrganization, organization]
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "reserveInvitationQuota",
    })
  }

  const exceeded = reservations.filter(({ count, maximum }) => count > maximum)
  if (exceeded.length === 0) {
    return
  }

  const retryAt = Math.max(
    ...exceeded.map(({ lastRequest }) =>
      Math.max(nowMs, lastRequest + invitationQuotaWindowMs)
    )
  )
  const retryAfter = Math.max(1, Math.ceil((retryAt - nowMs) / 1000))
  throw publicErrors.rateLimited(retryAfter)
}
