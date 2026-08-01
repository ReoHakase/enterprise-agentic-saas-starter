import type { Db } from "@enterprise-agentic-saas/db"
import { member } from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import type { MembershipQuery } from "./ports"
import { normalizeOrganizationRole } from "./roles"

export const findMembership = async (db: Db, input: MembershipQuery) => {
  const rows = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, input.userId),
        eq(member.organizationId, input.organizationId)
      )
    )
    .limit(1)

  const row = rows[0]
  return row ? { id: row.id, role: normalizeOrganizationRole(row.role) } : null
}
