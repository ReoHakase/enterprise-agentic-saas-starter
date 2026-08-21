import type { OrganizationRole } from "../authorization/public"
import type {
  OrganizationDeletionReceipt,
  OrganizationDetail,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
} from "./domain"

type OrganizationMembership = {
  id: string
  role: OrganizationRole
}

type OrganizationMemberTarget = {
  email: string
  id: string
  role: OrganizationRole
  userId: string
}

type DeleteOrganizationResult =
  | { kind: "active_organization_mismatch" }
  | { kind: "deleted"; receipt: OrganizationDeletionReceipt }
  | { kind: "forbidden" }
  | { kind: "idempotency_conflict" }
  | { kind: "not_found" }
  | { kind: "slug_mismatch" }

type CancelInvitationResult =
  | { kind: "not_found" }
  | { kind: "not_pending" }
  | {
      invitation: { id: string; status: "canceled" }
      kind: "canceled"
    }

export type OrganizationsPorts = {
  countOwners(organizationId: string): Promise<number>
  deleteMemberById(input: {
    actorUserId: string
    confirmation: string
    memberId: string
    organizationId: string
    removedRole: OrganizationRole
    session: unknown
    userId: string
  }): Promise<{ id: string } | null>
  deleteOrganizationById(input: {
    actorUserId: string
    idempotencyKey: string
    organizationId: string
    sessionId: string
    slug: string
  }): Promise<DeleteOrganizationResult>
  findMemberById(input: {
    memberId: string
    organizationId: string
  }): Promise<OrganizationMemberTarget | null>
  findOrganizationForUser(input: {
    activeOrganizationId?: null | string
    organizationId: string
    userId: string
  }): Promise<OrganizationDetail | null>
  insertOrganizationWithOwner(input: {
    activate: boolean
    name: string
    sessionId: string
    slug: string
    userId: string
  }): Promise<OrganizationDetail>
  listMembersByOrganization(
    organizationId: string
  ): Promise<OrganizationMember[]>
  listOrganizationsForUser(input: {
    activeOrganizationId?: null | string
    userId: string
  }): Promise<OrganizationSummary[]>
  requireMembership(input: {
    organizationId: string
    userId: string
  }): Promise<OrganizationMembership>
  requireOrganizationRole(input: {
    action: string
    allow: readonly OrganizationRole[]
    organizationId: string
    userId: string
  }): Promise<OrganizationMembership>
  transferOwnershipById(input: {
    actorMemberId: string
    actorUserId: string
    organizationId: string
    targetMemberId: string
  }): Promise<
    | "actor_not_owner"
    | "invalid_owner_count"
    | "target_not_found"
    | "transferred"
  >
  updateMemberRoleById(input: {
    actorUserId: string
    memberId: string
    organizationId: string
    previousRole: OrganizationRole
    role: OrganizationRole
    session: unknown
    userId: string
  }): Promise<unknown>
  updateOrganizationById(input: {
    actorUserId: string
    name?: string
    organizationId: string
    slug?: string
  }): Promise<OrganizationDetail | null>
  updateSessionActiveOrganization(input: {
    organizationId: string
    sessionId: string
    userId: string
  }): Promise<"activated" | "not_member" | "session_not_found">
}

export type InvitationPorts = {
  cancelInvitationById(input: {
    actorUserId: string
    invitationId: string
    organizationId: string
  }): Promise<CancelInvitationResult>
  listInvitationsByOrganization(
    organizationId: string
  ): Promise<OrganizationInvitation[]>
  requireOrganizationRole(input: {
    action: string
    allow: readonly OrganizationRole[]
    organizationId: string
    userId: string
  }): Promise<OrganizationMembership>
}

export type OrganizationDeletionAccessPorts = {
  findOrganizationDeletionReceipt(input: {
    actorUserId: string
    idempotencyKey: string
    organizationId: string
  }): Promise<OrganizationDeletionReceipt | null>
  requireMembership(input: {
    organizationId: string
    userId: string
  }): Promise<OrganizationMembership>
}
