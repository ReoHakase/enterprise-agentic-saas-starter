import { Elysia } from "elysia"
import * as v from "valibot"

import { HttpError } from "../../../errors/http-error"
import { sessionCookieSecurity } from "../../../models/api"
import type { GetSessionContext } from "../../auth/public"
import type { OrganizationDeletionAccessService } from "../deletion-access-service"
import { organizationDeletionIdempotencyKeyModel } from "../model"

const requiredString = (container: unknown, field: string) => {
  if (!container || typeof container !== "object") {
    throw new HttpError({ code: "validation_error" })
  }
  const value = Reflect.get(container, field)
  if (typeof value !== "string" || !value) {
    throw new HttpError({ code: "validation_error" })
  }
  return value
}

/** @internal */
export const parseOrganizationDeletionIdempotencyKey = (value: unknown) => {
  const parsedKey = v.safeParse(organizationDeletionIdempotencyKeyModel, value)
  if (!parsedKey.success) {
    throw new HttpError({ code: "validation_error" })
  }

  return parsedKey.output
}

export const createOrganizationDeletionAccessRoutes = (
  service: OrganizationDeletionAccessService,
  getSessionContext: GetSessionContext
) =>
  new Elysia({ name: "organization-deletion-access" }).macro({
    organizationDeletionAccess: {
      detail: {
        security: [...sessionCookieSecurity],
      },
      async resolve({ body, params, request }) {
        const authContext = await getSessionContext(request)
        const organizationId = requiredString(params, "organizationId")
        const idempotencyKey = parseOrganizationDeletionIdempotencyKey(
          requiredString(body, "idempotencyKey")
        )
        const organizationDeletionAccess = await service.authorizeDeletion({
          idempotencyKey,
          organizationId,
          session: authContext.session,
          userId: authContext.user.id,
        })
        return {
          authContext,
          organizationDeletionAccess,
        }
      },
    },
  })
