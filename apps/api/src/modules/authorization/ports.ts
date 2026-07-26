import type { OrganizationRole } from "./roles"

type Membership = {
  id: string
  role: OrganizationRole
}

export type MembershipQuery = {
  organizationId: string
  userId: string
}

export type AuthorizationPorts = {
  findMembership(input: MembershipQuery): Promise<Membership | null>
}
