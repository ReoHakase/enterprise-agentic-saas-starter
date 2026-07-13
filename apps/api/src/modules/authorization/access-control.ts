import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"

import { publicErrors } from "../../errors/app-error"
import { sessionCookieSecurity } from "../../models/api"
import { getSessionContext, type SessionContext } from "../auth/session"
import { requireMembership, type OrganizationRole } from "./roles"

export const STEP_UP_MAX_AGE_SECONDS = 15 * 60

type OrganizationIdSource = "body" | "params" | "query"

export type OrganizationAccessOptions = {
  action: string
  allow?: readonly OrganizationRole[]
  fresh?: boolean
  requireActive?: boolean
  source: OrganizationIdSource
}

const organizationIdFrom = (
  source: OrganizationIdSource,
  context: { body: unknown; params: unknown; query: unknown }
) => {
  const container = context[source]
  if (!container || typeof container !== "object") {
    throw publicErrors.validation("Organization id is required", {
      field: "organizationId",
    })
  }

  const organizationId = Reflect.get(container, "organizationId")
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw publicErrors.validation("Organization id is required", {
      field: "organizationId",
    })
  }

  return organizationId
}

export const requireActiveOrganization = (
  session: SessionContext,
  organizationId: string
) => {
  if (!session.activeOrganizationId) {
    throw publicErrors.activeOrganizationRequired()
  }

  if (session.activeOrganizationId !== organizationId) {
    throw publicErrors.activeOrganizationMismatch()
  }
}

export const requireFreshSession = (
  session: SessionContext,
  action: string,
  now = Date.now()
) => {
  const createdAt = session.createdAt.getTime()
  const age = now - createdAt
  const maxAge = STEP_UP_MAX_AGE_SECONDS * 1000

  // 欠損・不正値・未来時刻もfreshとして扱わず、常に再認証へ倒す。
  if (!Number.isFinite(createdAt) || age < 0 || age > maxAge) {
    throw publicErrors.stepUpRequired(action, STEP_UP_MAX_AGE_SECONDS)
  }
}

export const createAccessControlModule = (db: Db) =>
  new Elysia({ name: "access-control" }).macro({
    authenticated: {
      detail: {
        security: [...sessionCookieSecurity],
      },
      async resolve({ request }) {
        return {
          authContext: await getSessionContext(request),
        }
      },
    },
    organizationAccess: (options: OrganizationAccessOptions) => ({
      detail: {
        security: [...sessionCookieSecurity],
      },
      async resolve(context) {
        const authContext = await getSessionContext(context.request)
        const organizationId = organizationIdFrom(options.source, context)
        const membership = await requireMembership(db, {
          userId: authContext.user.id,
          organizationId,
        })

        if (options.requireActive !== false) {
          requireActiveOrganization(authContext.session, organizationId)
        }

        if (options.allow && !options.allow.includes(membership.role)) {
          throw publicErrors.forbidden(
            "You are not allowed to perform this action",
            { action: options.action }
          )
        }

        if (options.fresh) {
          requireFreshSession(authContext.session, options.action)
        }

        return {
          authContext,
          organizationAccess: {
            id: organizationId,
            membership,
          },
        }
      },
    }),
  })
