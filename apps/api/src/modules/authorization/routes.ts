import { Elysia } from "elysia"

import { HttpError } from "../../errors/http-error"
import { sessionCookieSecurity } from "../../models/api"
import type { SessionContext, SessionUser } from "../auth/public"
import type { OrganizationRole } from "./roles"
import type { AuthorizationService } from "./service"

const STEP_UP_MAX_AGE_SECONDS = 15 * 60

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
    throw new HttpError({ code: "validation_error" })
  }

  const organizationId = Reflect.get(container, "organizationId")
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw new HttpError({ code: "validation_error" })
  }

  return organizationId
}

export const requireActiveOrganization = (
  session: SessionContext,
  organizationId: string
) => {
  if (!session.activeOrganizationId) {
    throw new HttpError({ code: "active_organization_required" })
  }

  if (session.activeOrganizationId !== organizationId) {
    throw new HttpError({ code: "active_organization_mismatch" })
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
    throw new HttpError({ code: "step_up_required" })
  }
}

type AccessControlDependencies = {
  authorization: AuthorizationService
  getSessionContext(request: Request): Promise<{
    session: SessionContext
    user: SessionUser
  }>
}

export const createAccessControlRoutes = ({
  authorization,
  getSessionContext,
}: AccessControlDependencies) =>
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
        const membership = await authorization.requireMembership({
          userId: authContext.user.id,
          organizationId,
        })

        if (options.requireActive !== false) {
          requireActiveOrganization(authContext.session, organizationId)
        }

        if (options.allow && !options.allow.includes(membership.role)) {
          throw new HttpError({ code: "forbidden" })
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

export type AccessControlFactory = () => ReturnType<
  typeof createAccessControlRoutes
>
