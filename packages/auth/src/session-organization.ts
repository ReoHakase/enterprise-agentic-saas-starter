import type { Db } from "@enterprise-agentic-saas/db"
import { member, session } from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, gt, isNotNull } from "drizzle-orm"

/**
 * Resolve the organization context for a newly-created login session.
 *
 * A valid context must still be backed by a membership. We preserve the most
 * recently used valid context across account re-authentication, select the only
 * membership when there is no prior context, and otherwise require an explicit
 * organization choice.
 */
export const resolveInitialActiveOrganizationId = async (
  database: Db,
  userId: string,
  now = new Date()
) => {
  const recentRows = await database
    .select({ organizationId: session.activeOrganizationId })
    .from(session)
    .innerJoin(
      member,
      and(
        eq(member.userId, userId),
        eq(member.organizationId, session.activeOrganizationId)
      )
    )
    .where(
      and(
        eq(session.userId, userId),
        gt(session.expiresAt, now),
        isNotNull(session.activeOrganizationId)
      )
    )
    .orderBy(desc(session.updatedAt), desc(session.createdAt), desc(session.id))
    .limit(1)

  if (recentRows[0]?.organizationId) {
    return recentRows[0].organizationId
  }

  const membershipRows = await database
    .selectDistinct({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(member.organizationId)
    .limit(2)

  return membershipRows.length === 1
    ? (membershipRows[0]?.organizationId ?? null)
    : null
}

export const createSessionOrganizationDatabaseHooks = (database: Db) => ({
  session: {
    create: {
      async before(sessionData: { userId: string } & Record<string, unknown>) {
        return {
          data: {
            ...sessionData,
            activeOrganizationId: await resolveInitialActiveOrganizationId(
              database,
              sessionData.userId
            ),
          },
        }
      },
    },
  },
})
