import type { Db } from "@enterprise-agentic-saas/db"
import { renderOrganizationInvitationEmail } from "@enterprise-agentic-saas/email"
import { createRuntimeEmailSender } from "@enterprise-agentic-saas/email/runtime"

import { env } from "../../env"
import { publicErrors } from "../../errors/app-error"
import type { SessionContext } from "../auth/session"
import {
  requireActiveOrganization,
  requireFreshSession,
} from "../authorization/access-control"
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
  deleteOrganizationById,
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
  transferSuperAdminById,
} from "./repository"

const sendEmail = createRuntimeEmailSender({
  provider: env.EMAIL_PROVIDER,
  runtime: env.NODE_ENV,
  from: env.EMAIL_FROM,
  fromName: env.APP_NAME,
  mailpitUrl: env.MAILPIT_URL,
})

const normalizeRequired = (value: string, field: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw publicErrors.validation(`${field} is required`, { field })
  }
  return normalized
}

const reservedOrganizationSlugs = new Set([
  "admin",
  "api",
  "auth",
  "create",
  "dashboard",
  "new",
  "openapi",
  "organization",
  "organizations",
  "settings",
  "todos",
])

const normalizeSlug = (slug: string) => {
  const normalized = normalizeRequired(slug, "slug")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (normalized.length < 3 || normalized.length > 48) {
    throw publicErrors.validation("Slug must be 3 to 48 characters", {
      field: "slug",
      reason: "invalid_length",
    })
  }
  if (reservedOrganizationSlugs.has(normalized)) {
    throw publicErrors.validation("Slug is reserved", {
      field: "slug",
      reason: "reserved",
    })
  }
  return normalized
}

export const listOrganizations = async (
  db: Db,
  input: { userId: string; activeOrganizationId?: string | null }
) =>
  listOrganizationsForUser(db, {
    userId: input.userId,
    activeOrganizationId: input.activeOrganizationId,
  })

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
    sessionId: input.sessionId,
    activate: !input.keepCurrentActiveOrganization,
    name: normalizeRequired(input.name, "name"),
    slug: normalizeSlug(input.slug),
  })

  return organization
}

export const activateOrganization = async (
  db: Db,
  input: { userId: string; sessionId: string; organizationId: string }
) => {
  const result = await updateSessionActiveOrganization(db, input)
  if (result === "not_member") {
    throw publicErrors.notFound("Organization not found", {
      resource: "organization",
    })
  }
  if (result === "session_not_found") {
    throw publicErrors.internal(new Error("Session not found"), {
      module: "organizations",
      operation: "activateOrganization",
    })
  }
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
      resource: "organization",
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
    actorUserId: input.userId,
    organizationId: input.organizationId,
    name:
      input.name === undefined
        ? undefined
        : normalizeRequired(input.name, "name"),
    slug: input.slug === undefined ? undefined : normalizeSlug(input.slug),
  })

  if (!updated) {
    throw publicErrors.notFound("Organization not found", {
      resource: "organization",
    })
  }

  return { ...updated, active: true }
}

export const deleteOrganization = async (
  db: Db,
  input: {
    userId: string
    session: SessionContext
    organizationId: string
    slug: string
    confirmation: string
    idempotencyKey: string
  }
) => {
  const action = "organization.delete"
  requireActiveOrganization(input.session, input.organizationId)
  requireFreshSession(input.session, action)

  if (input.confirmation !== "DELETE") {
    throw publicErrors.confirmationRequired(action)
  }

  const result = await deleteOrganizationById(db, {
    actorUserId: input.userId,
    organizationId: input.organizationId,
    sessionId: input.session.id,
    slug: input.slug,
    idempotencyKey: input.idempotencyKey,
  })

  if (result.kind === "active_organization_mismatch") {
    throw publicErrors.activeOrganizationMismatch()
  }
  if (result.kind === "forbidden") {
    throw publicErrors.forbidden("You are not allowed to perform this action", {
      action,
    })
  }
  if (result.kind === "idempotency_conflict") {
    throw publicErrors.conflict("Idempotency key has already been used", {
      constraint: "idempotency_key",
      field: "idempotencyKey",
    })
  }
  if (result.kind === "not_found") {
    throw publicErrors.notFound("Organization not found", {
      resource: "organization",
    })
  }
  if (result.kind === "slug_mismatch") {
    throw publicErrors.confirmationRequired(action, { field: "slug" })
  }

  return result.receipt
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
    session: SessionContext
    organizationId: string
    memberId: string
    role: OrganizationRole
  }
) => {
  requireFreshSession(input.session, "organization.member.role_update")

  if (!isOrganizationRole(input.role)) {
    throw publicErrors.validation("Invalid role", {
      field: "role",
      reason: "unsupported_role",
    })
  }

  await requireOrganizationRole(db, {
    ...input,
    allow: ["super_admin"],
    action: "organization.member.role_update",
  })
  const target = await findMemberById(db, input)

  if (!target) {
    throw publicErrors.notFound("Member not found", {
      resource: "member",
    })
  }

  if (input.role === "super_admin" || target.role === "super_admin") {
    throw publicErrors.validation(
      "Use the ownership transfer flow for super admin changes",
      { action: "organization.transfer_super_admin" }
    )
  }

  if (target.role === input.role) {
    return listMembersByOrganization(db, input.organizationId)
  }

  await updateMemberRoleById(db, {
    ...input,
    actorUserId: input.userId,
    previousRole: target.role,
  })
  return listMembersByOrganization(db, input.organizationId)
}

export const transferSuperAdmin = async (
  db: Db,
  input: {
    userId: string
    session: SessionContext
    organizationId: string
    memberId: string
    confirmation: string
  }
) => {
  const action = "organization.transfer_super_admin"
  requireFreshSession(input.session, action)

  const actor = await requireOrganizationRole(db, {
    ...input,
    allow: ["super_admin"],
    action,
  })
  const target = await findMemberById(db, input)
  if (!target) {
    throw publicErrors.notFound("Member not found", { resource: "member" })
  }
  if (target.id === actor.id) {
    throw publicErrors.validation("Select another member", {
      field: "memberId",
    })
  }
  if (input.confirmation !== target.email) {
    throw publicErrors.confirmationRequired(action)
  }

  const result = await transferSuperAdminById(db, {
    actorMemberId: actor.id,
    actorUserId: input.userId,
    organizationId: input.organizationId,
    targetMemberId: target.id,
  })

  if (result === "actor_not_super_admin") {
    throw publicErrors.forbidden("Only the current super admin can transfer")
  }
  if (result === "target_not_found") {
    throw publicErrors.notFound("Member not found", { resource: "member" })
  }
  if (result === "invalid_super_admin_count") {
    throw publicErrors.internal(new Error("Invalid super admin count"), {
      module: "organizations",
      operation: "transferSuperAdmin",
    })
  }

  return listMembersByOrganization(db, input.organizationId)
}

export const removeMember = async (
  db: Db,
  input: {
    userId: string
    session: SessionContext
    organizationId: string
    memberId: string
    confirmation: string
  }
) => {
  requireFreshSession(input.session, "organization.member.remove")
  const actor = await requireMembership(db, input)
  const target = await findMemberById(db, input)

  if (!target) {
    throw publicErrors.notFound("Member not found", {
      resource: "member",
    })
  }

  if (target.userId === input.userId) {
    throw publicErrors.validation("Use leave organization flow for yourself")
  }

  if (input.confirmation !== target.email) {
    throw publicErrors.confirmationRequired("organization.member.remove")
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

  const deleted = await deleteMemberById(db, {
    ...input,
    actorUserId: input.userId,
    removedRole: target.role,
  })
  if (!deleted) {
    throw publicErrors.notFound("Member not found", {
      resource: "member",
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
    session: SessionContext
    inviterName?: string | null
    organizationId: string
    email: string
    role: Exclude<OrganizationRole, "super_admin">
  }
) => {
  const actor = await requireOrganizationRole(db, {
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
    inviterName: input.inviterName?.trim() || undefined,
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

  const result = await cancelInvitationById(db, {
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
