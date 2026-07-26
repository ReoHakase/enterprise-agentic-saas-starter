import { publicErrors } from "../../errors/app-error"
import type { SessionContext } from "../auth/public"
import {
  isOrganizationRole,
  requireActiveOrganization,
  requireFreshSession,
  type OrganizationRole,
} from "../authorization/public"
import type { OrganizationsPorts } from "./ports"

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
  "issues",
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

const createOrganizationCoreService = (ports: OrganizationsPorts) => {
  const listOrganizations = async (input: {
    userId: string
    activeOrganizationId?: string | null
  }) =>
    ports.listOrganizationsForUser({
      userId: input.userId,
      activeOrganizationId: input.activeOrganizationId,
    })

  const createOrganization = async (input: {
    userId: string
    sessionId: string
    name: string
    slug: string
    keepCurrentActiveOrganization?: boolean
  }) => {
    const organization = await ports.insertOrganizationWithSuperAdmin({
      userId: input.userId,
      sessionId: input.sessionId,
      activate: !input.keepCurrentActiveOrganization,
      name: normalizeRequired(input.name, "name"),
      slug: normalizeSlug(input.slug),
    })

    return organization
  }

  const activateOrganization = async (input: {
    userId: string
    sessionId: string
    organizationId: string
  }) => {
    const result = await ports.updateSessionActiveOrganization(input)
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

  const getOrganization = async (input: {
    userId: string
    organizationId: string
    activeOrganizationId?: string | null
  }) => {
    const organization = await ports.findOrganizationForUser(input)
    if (!organization) {
      throw publicErrors.notFound("Organization not found", {
        resource: "organization",
      })
    }
    return organization
  }

  const updateOrganization = async (input: {
    userId: string
    organizationId: string
    name?: string
    slug?: string
  }) => {
    await ports.requireOrganizationRole({
      userId: input.userId,
      organizationId: input.organizationId,
      allow: ["super_admin"],
      action: "organization.update",
    })

    if (input.name === undefined && input.slug === undefined) {
      throw publicErrors.validation("No organization changes provided")
    }

    const updated = await ports.updateOrganizationById({
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

  const deleteOrganization = async (input: {
    userId: string
    session: SessionContext
    organizationId: string
    slug: string
    confirmation: string
    idempotencyKey: string
  }) => {
    const action = "organization.delete"
    requireActiveOrganization(input.session, input.organizationId)
    requireFreshSession(input.session, action)

    if (input.confirmation !== "DELETE") {
      throw publicErrors.confirmationRequired(action)
    }

    const result = await ports.deleteOrganizationById({
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
      throw publicErrors.forbidden(
        "You are not allowed to perform this action",
        {
          action,
        }
      )
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

  return {
    activateOrganization,
    createOrganization,
    deleteOrganization,
    getOrganization,
    listOrganizations,
    updateOrganization,
  }
}

const createOrganizationMemberService = (ports: OrganizationsPorts) => {
  const listMembers = async (input: {
    userId: string
    organizationId: string
  }) => {
    await ports.requireMembership(input)
    return ports.listMembersByOrganization(input.organizationId)
  }

  const updateMemberRole = async (input: {
    userId: string
    session: SessionContext
    organizationId: string
    memberId: string
    role: OrganizationRole
  }) => {
    requireFreshSession(input.session, "organization.member.role_update")

    if (!isOrganizationRole(input.role)) {
      throw publicErrors.validation("Invalid role", {
        field: "role",
        reason: "unsupported_role",
      })
    }

    await ports.requireOrganizationRole({
      ...input,
      allow: ["super_admin"],
      action: "organization.member.role_update",
    })
    const target = await ports.findMemberById(input)

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
      return ports.listMembersByOrganization(input.organizationId)
    }

    await ports.updateMemberRoleById({
      ...input,
      actorUserId: input.userId,
      previousRole: target.role,
    })
    return ports.listMembersByOrganization(input.organizationId)
  }

  const transferSuperAdmin = async (input: {
    userId: string
    session: SessionContext
    organizationId: string
    memberId: string
    confirmation: string
  }) => {
    const action = "organization.transfer_super_admin"
    requireFreshSession(input.session, action)

    const actor = await ports.requireOrganizationRole({
      ...input,
      allow: ["super_admin"],
      action,
    })
    const target = await ports.findMemberById(input)
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

    const result = await ports.transferSuperAdminById({
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

    return ports.listMembersByOrganization(input.organizationId)
  }

  const removeMember = async (input: {
    userId: string
    session: SessionContext
    organizationId: string
    memberId: string
    confirmation: string
  }) => {
    requireFreshSession(input.session, "organization.member.remove")
    const actor = await ports.requireMembership(input)
    const target = await ports.findMemberById(input)

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
      (await ports.countSuperAdmins(input.organizationId)) <= 1
    ) {
      throw publicErrors.validation("Organization must keep one super admin")
    }

    const deleted = await ports.deleteMemberById({
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

  return {
    listMembers,
    removeMember,
    transferSuperAdmin,
    updateMemberRole,
  }
}

export const createOrganizationsService = (ports: OrganizationsPorts) => ({
  ...createOrganizationCoreService(ports),
  ...createOrganizationMemberService(ports),
})

export type OrganizationsService = ReturnType<typeof createOrganizationsService>
