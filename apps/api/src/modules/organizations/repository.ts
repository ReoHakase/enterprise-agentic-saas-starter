import type { Db } from "@enterprise-agentic-saas/db"
import { member, organization } from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: string
}

export const listOrganizationsForUser = async (
  db: Db,
  userId: string
): Promise<OrganizationSummary[]> => {
  try {
    return await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .orderBy(organization.name)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "listOrganizationsForUser",
    })
  }
}
