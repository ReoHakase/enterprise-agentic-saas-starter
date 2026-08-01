import { HttpError } from "../../errors/http-error"
import type { SessionContext } from "../auth/public"
import {
  requireActiveOrganization,
  requireFreshSession,
} from "../authorization/public"
import type { OrganizationDeletionAccessPorts } from "./ports"

const deletionAction = "organization.delete"

export type OrganizationDeletionAccess = {
  organizationId: string
  replayDeletionId: null | string
}

export const createOrganizationDeletionAccessService = (
  ports: OrganizationDeletionAccessPorts
) => {
  const authorizeDeletion = async (input: {
    idempotencyKey: string
    organizationId: string
    session: SessionContext
    userId: string
  }): Promise<OrganizationDeletionAccess> => {
    try {
      const membership = await ports.requireMembership({
        organizationId: input.organizationId,
        userId: input.userId,
      })

      requireActiveOrganization(input.session, input.organizationId)
      if (membership.role !== "owner") {
        throw new HttpError({ code: "forbidden" })
      }
      requireFreshSession(input.session, deletionAction)

      return {
        organizationId: input.organizationId,
        replayDeletionId: null,
      }
    } catch (error) {
      if (!(error instanceof HttpError) || error.code !== "not_found") {
        throw error
      }

      const replay = await ports.findOrganizationDeletionReceipt({
        actorUserId: input.userId,
        idempotencyKey: input.idempotencyKey,
        organizationId: input.organizationId,
      })
      if (!replay) {
        throw error
      }

      requireFreshSession(input.session, deletionAction)
      return {
        organizationId: input.organizationId,
        replayDeletionId: replay.deletionId,
      }
    }
  }

  return { authorizeDeletion }
}

export type OrganizationDeletionAccessService = ReturnType<
  typeof createOrganizationDeletionAccessService
>
