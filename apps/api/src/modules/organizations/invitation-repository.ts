import type { Db } from "@enterprise-agentic-saas/db"
import { invitation, user } from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"

import { toOrganizationInvitation, type OrganizationInvitation } from "./domain"

export const listInvitationsByOrganization = async (
  db: Db,
  organizationId: string
): Promise<OrganizationInvitation[]> => {
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
}
