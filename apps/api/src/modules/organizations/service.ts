import type { Db } from "@enterprise-agentic-saas/db"
import {
  createConsoleSender,
  createNoopSender,
  renderOrganizationInvitationEmail,
} from "@enterprise-agentic-saas/email"

import { env } from "../../env"
import { publicErrors } from "../../errors/app-error"
import {
  isOrganizationRole,
  requireMembership,
  requireOrganizationRole,
  type OrganizationRole,
} from "../authorization/roles"
import {
  cancelInvitationById,
  countSuperAdmins,
  deleteMemberById,
  findMemberById,
  findOrganizationForUser,
  insertInvitation,
  insertOrganizationWithSuperAdmin,
  listInvitationsByOrganization,
  listMembersByOrganization,
  listOrganizationsForUser,
  updateMemberRoleById,
  updateOrganizationById,
  updateSessionActiveOrganization,
} from "./repository"

const sendEmail =
  env.NODE_ENV === "test" ? createNoopSender() : createConsoleSender()

const normalizeRequired = (value: string, field: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw publicErrors.validation(`${field} is required`, { field })
  }
  return normalized
}

const normalizeSlug = (slug: string) =>
  normalizeRequired(slug, "slug")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")

export const listOrganizations = async (
  db: Db,
  input: { userId: string; activeOrganizationId?: string | null }
) => listOrganizationsForUser(db, input)

export const createOrganization = async (
  db: Db,
  input: {
    userId: string
    sessionId: string
    name: string
    slug: string
    keepCurrentActiveOrganization?: boolean
  }
) => {
  const organization = await insertOrganizationWithSuperAdmin(db, {
    userId: input.userId,
    name: normalizeRequired(input.name, "name"),
    slug: normalizeSlug(input.slug),
  })

  if (!input.keepCurrentActiveOrganization) {
    await updateSessionActiveOrganization(db, {
      sessionId: input.sessionId,
      organizationId: organization.id,
    })
    return { ...organization, active: true }
  }

  return organization
}

export const activateOrganization = async (
  db: Db,
  input: { userId: string; sessionId: string; organizationId: string }
) => {
  await requireMembership(db, input)
  await updateSessionActiveOrganization(db, input)
  return { activeOrganizationId: input.organizationId }
}

export const getOrganization = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    activeOrganizationId?: string | null
  }
) => {
  const organization = await findOrganizationForUser(db, input)
  if (!organization) {
    throw publicErrors.notFound("Organization not found", {
      organizationId: input.organizationId,
    })
  }
  return organization
}

export const updateOrganization = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    name?: string
    slug?: string
  }
) => {
  await requireOrganizationRole(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    allow: ["super_admin"],
    action: "organization.update",
  })

  if (input.name === undefined && input.slug === undefined) {
    throw publicErrors.validation("No organization changes provided")
  }

  const updated = await updateOrganizationById(db, {
    organizationId: input.organizationId,
    name:
      input.name === undefined
        ? undefined
        : normalizeRequired(input.name, "name"),
    slug: input.slug === undefined ? undefined : normalizeSlug(input.slug),
  })

  if (!updated) {
    throw publicErrors.notFound("Organization not found", {
      organizationId: input.organizationId,
    })
  }

  return { ...updated, active: true }
}

export const listMembers = async (
  db: Db,
  input: { userId: string; organizationId: string }
) => {
  await requireMembership(db, input)
  return listMembersByOrganization(db, input.organizationId)
}

export const updateMemberRole = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    memberId: string
    role: OrganizationRole
  }
) => {
  if (!isOrganizationRole(input.role)) {
    throw publicErrors.validation("Invalid role", { role: input.role })
  }

  const actor = await requireMembership(db, input)
  const target = await findMemberById(db, input)

  if (!target) {
    throw publicErrors.notFound("Member not found", {
      memberId: input.memberId,
    })
  }

  if (actor.role === "member") {
    throw publicErrors.forbidden("Members cannot update roles")
  }

  if (actor.role === "admin") {
    if (target.role !== "member" || input.role === "super_admin") {
      throw publicErrors.forbidden("Admins can only manage members")
    }
  }

  if (
    target.role === "super_admin" &&
    input.role !== "super_admin" &&
    (await countSuperAdmins(db, input.organizationId)) <= 1
  ) {
    throw publicErrors.validation("Organization must keep one super admin")
  }

  await updateMemberRoleById(db, input)
  return listMembersByOrganization(db, input.organizationId)
}

export const removeMember = async (
  db: Db,
  input: { userId: string; organizationId: string; memberId: string }
) => {
  const actor = await requireMembership(db, input)
  const target = await findMemberById(db, input)

  if (!target) {
    throw publicErrors.notFound("Member not found", {
      memberId: input.memberId,
    })
  }

  if (target.userId === input.userId) {
    throw publicErrors.validation("Use leave organization flow for yourself")
  }

  if (actor.role === "member") {
    throw publicErrors.forbidden("Members cannot remove members")
  }

  if (actor.role === "admin" && target.role !== "member") {
    throw publicErrors.forbidden("Admins can only remove members")
  }

  if (
    target.role === "super_admin" &&
    (await countSuperAdmins(db, input.organizationId)) <= 1
  ) {
    throw publicErrors.validation("Organization must keep one super admin")
  }

  const deleted = await deleteMemberById(db, input)
  if (!deleted) {
    throw publicErrors.notFound("Member not found", {
      memberId: input.memberId,
    })
  }

  return { id: deleted.id }
}

export const listInvitations = async (
  db: Db,
  input: { userId: string; organizationId: string }
) => {
  await requireOrganizationRole(db, {
    ...input,
    allow: ["super_admin", "admin"],
    action: "invitation.list",
  })
  return listInvitationsByOrganization(db, input.organizationId)
}

export const createInvitation = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    email: string
    role: Exclude<OrganizationRole, "super_admin">
  }
) => {
  await requireOrganizationRole(db, {
    ...input,
    allow: ["super_admin", "admin"],
    action: "invitation.create",
  })

  const invitation = await insertInvitation(db, {
    organizationId: input.organizationId,
    inviterId: input.userId,
    email: normalizeRequired(input.email, "email").toLowerCase(),
    role: input.role,
  })
  const organization = await getOrganization(db, input)
  const rendered = await renderOrganizationInvitationEmail({
    appName: env.APP_NAME,
    organizationName: organization.name,
    invitationUrl: `${env.APP_BASE_URL}/organization/invitations/${invitation.id}`,
    inviterName: input.userId,
  })

  await sendEmail({ to: invitation.email, ...rendered })

  return invitation
}

export const cancelInvitation = async (
  db: Db,
  input: { userId: string; organizationId: string; invitationId: string }
) => {
  await requireOrganizationRole(db, {
    ...input,
    allow: ["super_admin", "admin"],
    action: "invitation.cancel",
  })

  const invitation = await cancelInvitationById(db, input)
  if (!invitation) {
    throw publicErrors.notFound("Invitation not found", {
      invitationId: input.invitationId,
    })
  }

  return { id: invitation.id, status: invitation.status }
}
