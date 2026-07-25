import { publicErrors } from "../../errors/app-error"
import type { SessionContext } from "../auth/public"
import {
  requireFreshSession,
  type OrganizationRole,
} from "../authorization/public"
import type { InvitationPorts } from "./ports"

const normalizeRequired = (value: string, field: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw publicErrors.validation(`${field} is required`, { field })
  }
  return normalized
}

export const createInvitationService = (ports: InvitationPorts) => {
  const listInvitations = async (input: {
    userId: string
    organizationId: string
  }) => {
    await ports.requireOrganizationRole({
      ...input,
      allow: ["super_admin", "admin"],
      action: "invitation.list",
    })

    return ports.listInvitationsByOrganization(input.organizationId)
  }

  const createInvitation = async (input: {
    userId: string
    session: SessionContext
    organizationId: string
    emails: readonly string[]
    role: Exclude<OrganizationRole, "super_admin">
  }) => {
    const actor = await ports.requireOrganizationRole({
      ...input,
      allow: ["super_admin", "admin"],
      action: "invitation.create",
    })

    if (actor.role === "admin" && input.role !== "member") {
      throw publicErrors.forbidden("Admins can only invite members")
    }
    if (input.role === "admin") {
      requireFreshSession(input.session, "organization.invitation.grant_admin")
    }

    const emails = Array.from(
      new Set(
        input.emails.map((email) =>
          normalizeRequired(email, "emails").toLowerCase()
        )
      )
    )
    if (emails.length === 0 || emails.length > 20) {
      throw publicErrors.validation(
        "Provide between 1 and 20 email addresses",
        {
          field: "emails",
          reason: "invalid_length",
        }
      )
    }

    await ports.reserveInvitationQuota({
      actorUserId: input.userId,
      organizationId: input.organizationId,
      recipientCount: emails.length,
    })

    const invitations = await ports.insertInvitations({
      organizationId: input.organizationId,
      inviterId: input.userId,
      emails,
      role: input.role,
    })
    await ports.dispatchInvitationEmailJobs()

    return {
      invitations,
      queuedCount: invitations.length,
      delivery: "queued" as const,
    }
  }

  const resendInvitation = async (input: {
    userId: string
    session: SessionContext
    organizationId: string
    invitationId: string
  }) => {
    const actor = await ports.requireOrganizationRole({
      ...input,
      allow: ["super_admin", "admin"],
      action: "invitation.resend",
    })
    const target = await ports.findInvitationForResend(input)
    if (!target) {
      throw publicErrors.notFound("Invitation not found", {
        resource: "invitation",
      })
    }
    if (target.status !== "pending" && target.status !== "expired") {
      throw publicErrors.conflict("Invitation cannot be resent", {
        resource: "invitation",
        reason: "invitation_not_resendable",
      })
    }
    if (target.role !== "admin" && target.role !== "member") {
      throw publicErrors.conflict("Invitation cannot be resent", {
        resource: "invitation",
        reason: "invitation_not_resendable",
      })
    }
    if (target.role === "admin") {
      if (actor.role !== "super_admin") {
        throw publicErrors.forbidden(
          "Only the super admin can resend admin invitations"
        )
      }
      requireFreshSession(input.session, "organization.invitation.resend_admin")
    }

    await ports.reserveInvitationQuota({
      actorUserId: input.userId,
      organizationId: input.organizationId,
      recipientCount: 1,
    })

    const result = await ports.resendInvitationById({
      actorUserId: input.userId,
      organizationId: input.organizationId,
      invitationId: input.invitationId,
    })
    if (result.kind === "not_found") {
      throw publicErrors.notFound("Invitation not found", {
        resource: "invitation",
      })
    }
    if (result.kind === "actor_not_member") {
      throw publicErrors.notFound("Invitation not found", {
        resource: "invitation",
      })
    }
    if (result.kind === "actor_forbidden") {
      throw publicErrors.forbidden("Invitation resend is not allowed")
    }
    if (result.kind === "not_resendable") {
      throw publicErrors.conflict("Invitation cannot be resent", {
        resource: "invitation",
        reason: "invitation_not_resendable",
      })
    }

    await ports.dispatchInvitationEmailJobs()
    return {
      invitation: result.invitation,
      delivery: "queued" as const,
      revived: result.revived,
    }
  }

  const cancelInvitation = async (input: {
    userId: string
    organizationId: string
    invitationId: string
  }) => {
    await ports.requireOrganizationRole({
      ...input,
      allow: ["super_admin", "admin"],
      action: "invitation.cancel",
    })

    const result = await ports.cancelInvitationById({
      ...input,
      actorUserId: input.userId,
    })
    if (result.kind === "not_found") {
      throw publicErrors.notFound("Invitation not found", {
        resource: "invitation",
      })
    }
    if (result.kind === "not_pending") {
      throw publicErrors.conflict("Invitation is not pending", {
        resource: "invitation",
        reason: "invitation_not_pending",
      })
    }

    return { id: result.invitation.id, status: result.invitation.status }
  }

  return {
    cancelInvitation,
    createInvitation,
    listInvitations,
    resendInvitation,
  }
}

export type InvitationService = ReturnType<typeof createInvitationService>
