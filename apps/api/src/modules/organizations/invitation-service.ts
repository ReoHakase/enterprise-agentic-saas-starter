import { HttpError } from "../../errors/http-error"
import type { InvitationPorts } from "./ports"

export const createInvitationService = (ports: InvitationPorts) => {
  const listInvitations = async (input: {
    userId: string
    organizationId: string
  }) => {
    await ports.requireOrganizationRole({
      ...input,
      allow: ["owner", "admin"],
      action: "invitation.list",
    })

    return ports.listInvitationsByOrganization(input.organizationId)
  }

  const cancelInvitation = async (input: {
    userId: string
    organizationId: string
    invitationId: string
  }) => {
    await ports.requireOrganizationRole({
      ...input,
      allow: ["owner", "admin"],
      action: "invitation.cancel",
    })

    const result = await ports.cancelInvitationById({
      ...input,
      actorUserId: input.userId,
    })
    if (result.kind === "not_found") {
      throw new HttpError({ code: "not_found" })
    }
    if (result.kind === "not_pending") {
      throw new HttpError({ code: "conflict" })
    }

    return { id: result.invitation.id, status: result.invitation.status }
  }

  return {
    cancelInvitation,
    listInvitations,
  }
}

export type InvitationService = ReturnType<typeof createInvitationService>
