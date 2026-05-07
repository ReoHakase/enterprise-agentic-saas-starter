import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { getSessionUser } from "../auth/session"
import { listOrganizations } from "./service"

const organizationSummaryModel = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  role: t.String(),
})

export const createOrganizationsModule = (db: Db) =>
  new Elysia({ name: "organizations" }).get(
    "/organizations",
    async ({ request }) => {
      const user = await getSessionUser(request)
      return listOrganizations(db, user.id)
    },
    {
      response: t.Array(organizationSummaryModel),
    }
  )
