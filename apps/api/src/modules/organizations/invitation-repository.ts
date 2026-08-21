import type { Db } from "@enterprise-agentic-saas/db"
import { invitation, user } from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import * as v from "valibot"

import {
  organizationInvitationRoles,
  organizationInvitationStatuses,
  toOrganizationInvitation,
  type OrganizationInvitation,
} from "./domain"

const invitationRoleModel = v.picklist(organizationInvitationRoles)
const invitationStatusModel = v.picklist(organizationInvitationStatuses)

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

  return rows.flatMap(({ invitation: row, inviter }) => {
    const role = v.safeParse(invitationRoleModel, row.role ?? "member")
    const status = v.safeParse(invitationStatusModel, row.status)
    if (!role.success || !status.success) return []

    return [
      toOrganizationInvitation(
        { ...row, role: role.output, status: status.output },
        inviter
      ),
    ]
  })
}
