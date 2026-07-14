import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"
import * as v from "valibot"

import { AppError, publicErrors } from "../../errors/app-error"
import { sessionCookieSecurity } from "../../models/api"
import { getSessionContext } from "../auth/session"
import {
  requireActiveOrganization,
  requireFreshSession,
} from "../authorization/access-control"
import { requireMembership } from "../authorization/roles"
import { organizationDeletionIdempotencyKeyModel } from "./model"
import { findOrganizationDeletionReceipt } from "./repository"

const deletionAction = "organization.delete"

type OrganizationDeletionAccess = {
  organizationId: string
  replayDeletionId: string | null
}

const requiredString = (container: unknown, field: string) => {
  if (!container || typeof container !== "object") {
    throw publicErrors.validation(`${field} is required`, { field })
  }
  const value = Reflect.get(container, field)
  if (typeof value !== "string" || !value) {
    throw publicErrors.validation(`${field} is required`, { field })
  }
  return value
}

export const parseOrganizationDeletionIdempotencyKey = (value: unknown) => {
  const parsedKey = v.safeParse(organizationDeletionIdempotencyKeyModel, value)
  if (!parsedKey.success) {
    throw publicErrors.validation("Invalid idempotency key", {
      field: "idempotencyKey",
    })
  }

  return parsedKey.output
}

export const createOrganizationDeletionAccessModule = (db: Db) =>
  new Elysia({ name: "organization-deletion-access" }).macro({
    organizationDeletionAccess: {
      detail: {
        security: [...sessionCookieSecurity],
      },
      async resolve({ body, params, request }) {
        const authContext = await getSessionContext(request)
        const organizationId = requiredString(params, "organizationId")

        let membership: Awaited<ReturnType<typeof requireMembership>>

        try {
          membership = await requireMembership(db, {
            userId: authContext.user.id,
            organizationId,
          })
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== "not_found") {
            throw error
          }

          const idempotencyKey = parseOrganizationDeletionIdempotencyKey(
            requiredString(body, "idempotencyKey")
          )

          const replay = await findOrganizationDeletionReceipt(db, {
            actorUserId: authContext.user.id,
            organizationId,
            idempotencyKey,
          })
          if (!replay) {
            throw error
          }

          requireFreshSession(authContext.session, deletionAction)
          const organizationDeletionAccess: OrganizationDeletionAccess = {
            organizationId,
            replayDeletionId: replay.deletionId,
          }
          return {
            authContext,
            organizationDeletionAccess,
          }
        }

        requireActiveOrganization(authContext.session, organizationId)
        if (membership.role !== "super_admin") {
          throw publicErrors.forbidden(
            "You are not allowed to perform this action",
            { action: deletionAction }
          )
        }
        requireFreshSession(authContext.session, deletionAction)

        const organizationDeletionAccess: OrganizationDeletionAccess = {
          organizationId,
          replayDeletionId: null,
        }
        return {
          authContext,
          organizationDeletionAccess,
        }
      },
    },
  })
