import { HttpError } from "../../errors/http-error"
import { createObservedLogger } from "../../platform/observability/runtime"
import type { SessionContext } from "../auth/public"
import {
  isOrganizationRole,
  requireActiveOrganization,
  requireFreshSession,
  type OrganizationRole,
} from "../authorization/public"
import type { OrganizationsPorts } from "./ports"

const memberListLogger = createObservedLogger("organizations").child("members")

const normalizeRequired = (value: string, field: string) => {
  const normalized = value.trim()
  if (!normalized) {
    const message = `${field} is required.`
    throw new HttpError({
      code: "validation_error",
      fieldErrors: { [field]: [message] },
      publicMessage: message,
    })
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
    throw new HttpError({
      code: "validation_error",
      fieldErrors: { slug: ["Use 3 to 48 characters."] },
      publicMessage: "The organization slug must be 3 to 48 characters.",
    })
  }
  if (reservedOrganizationSlugs.has(normalized)) {
    throw new HttpError({
      code: "validation_error",
      fieldErrors: { slug: ["Choose another slug."] },
      publicMessage: "This organization slug is reserved.",
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
    const organization = await ports.insertOrganizationWithOwner({
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
      throw new HttpError({ code: "not_found" })
    }
    if (result === "session_not_found") {
      throw new Error("Session not found")
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
      throw new HttpError({ code: "not_found" })
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
      allow: ["owner"],
      action: "organization.update",
    })

    if (input.name === undefined && input.slug === undefined) {
      throw new HttpError({
        code: "validation_error",
        publicMessage: "Provide an organization change.",
      })
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
      throw new HttpError({ code: "not_found" })
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
      throw new HttpError({
        code: "confirmation_required",
        fieldErrors: { confirmation: ["Type DELETE exactly."] },
      })
    }

    const result = await ports.deleteOrganizationById({
      actorUserId: input.userId,
      organizationId: input.organizationId,
      sessionId: input.session.id,
      slug: input.slug,
      idempotencyKey: input.idempotencyKey,
    })

    if (result.kind === "active_organization_mismatch") {
      throw new HttpError({ code: "active_organization_mismatch" })
    }
    if (result.kind === "forbidden") {
      throw new HttpError({ code: "forbidden" })
    }
    if (result.kind === "idempotency_conflict") {
      throw new HttpError({
        code: "conflict",
        fieldErrors: {
          idempotencyKey: ["This idempotency key has already been used."],
        },
      })
    }
    if (result.kind === "not_found") {
      throw new HttpError({ code: "not_found" })
    }
    if (result.kind === "slug_mismatch") {
      throw new HttpError({
        code: "confirmation_required",
        fieldErrors: { slug: ["Type the organization slug exactly."] },
      })
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
    const members = await ports.listMembersByOrganization(input.organizationId)
    memberListLogger.info("Organization member list resolved", {
      "app.operation": "listOrganizationMembers",
      "app.outcome": "success",
      "organization.member.result_count": members.length,
      "organization.member.owner_count": members.filter(
        (member) => member.role === "owner"
      ).length,
      "organization.member.admin_count": members.filter(
        (member) => member.role === "admin"
      ).length,
      "organization.member.member_count": members.filter(
        (member) => member.role === "member"
      ).length,
    })
    return members
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
      throw new HttpError({
        code: "validation_error",
        fieldErrors: { role: ["Choose a supported role."] },
      })
    }

    await ports.requireOrganizationRole({
      ...input,
      allow: ["owner"],
      action: "organization.member.role_update",
    })
    const target = await ports.findMemberById(input)

    if (!target) {
      throw new HttpError({ code: "not_found" })
    }

    if (input.role === "owner" || target.role === "owner") {
      throw new HttpError({
        code: "validation_error",
        publicMessage: "Use the ownership transfer flow for owner changes.",
      })
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

  const transferOwnership = async (input: {
    userId: string
    session: SessionContext
    organizationId: string
    memberId: string
    confirmation: string
  }) => {
    const action = "organization.transfer_owner"
    requireFreshSession(input.session, action)

    const actor = await ports.requireOrganizationRole({
      ...input,
      allow: ["owner"],
      action,
    })
    const target = await ports.findMemberById(input)
    if (!target) {
      throw new HttpError({ code: "not_found" })
    }
    if (target.id === actor.id) {
      throw new HttpError({
        code: "validation_error",
        fieldErrors: { memberId: ["Choose another member."] },
      })
    }
    if (input.confirmation !== target.email) {
      throw new HttpError({
        code: "confirmation_required",
        fieldErrors: {
          confirmation: ["Type the member email address exactly."],
        },
      })
    }

    const result = await ports.transferOwnershipById({
      actorMemberId: actor.id,
      actorUserId: input.userId,
      organizationId: input.organizationId,
      targetMemberId: target.id,
    })

    if (result === "actor_not_owner") {
      throw new HttpError({ code: "forbidden" })
    }
    if (result === "target_not_found") {
      throw new HttpError({ code: "not_found" })
    }
    if (result === "invalid_owner_count") {
      throw new Error("Invalid owner count")
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
      throw new HttpError({ code: "not_found" })
    }

    if (target.userId === input.userId) {
      throw new HttpError({
        code: "validation_error",
        publicMessage: "Use the leave organization flow for yourself.",
      })
    }

    if (input.confirmation !== target.email) {
      throw new HttpError({
        code: "confirmation_required",
        fieldErrors: {
          confirmation: ["Type the member email address exactly."],
        },
      })
    }

    if (actor.role === "member") {
      throw new HttpError({ code: "forbidden" })
    }

    if (actor.role === "admin" && target.role !== "member") {
      throw new HttpError({ code: "forbidden" })
    }

    if (
      target.role === "owner" &&
      (await ports.countOwners(input.organizationId)) <= 1
    ) {
      throw new HttpError({
        code: "validation_error",
        publicMessage: "The organization must keep one owner.",
      })
    }

    const deleted = await ports.deleteMemberById({
      ...input,
      actorUserId: input.userId,
      removedRole: target.role,
    })
    if (!deleted) {
      throw new HttpError({ code: "not_found" })
    }

    return { id: deleted.id }
  }

  return {
    listMembers,
    removeMember,
    transferOwnership,
    updateMemberRole,
  }
}

export const createOrganizationsService = (ports: OrganizationsPorts) => ({
  ...createOrganizationCoreService(ports),
  ...createOrganizationMemberService(ports),
})

export type OrganizationsService = ReturnType<typeof createOrganizationsService>
