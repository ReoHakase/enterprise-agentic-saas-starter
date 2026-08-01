import { HttpError } from "../../errors/http-error"
import type { AuthorizationPorts, MembershipQuery } from "./ports"
import type { OrganizationRole } from "./roles"

export const createAuthorizationService = (ports: AuthorizationPorts) => {
  const getMembership = (input: MembershipQuery) => ports.findMembership(input)

  const requireMembership = async (input: MembershipQuery) => {
    const membership = await getMembership(input)
    if (!membership) {
      // organizationの存在と「他tenantに存在する」ことを区別させない。
      throw new HttpError({ code: "not_found" })
    }
    return membership
  }

  const requireOrganizationRole = async (
    input: MembershipQuery & {
      action: string
      allow: readonly OrganizationRole[]
    }
  ) => {
    const membership = await requireMembership(input)
    if (!input.allow.includes(membership.role)) {
      throw new HttpError({ code: "forbidden" })
    }
    return membership
  }

  return {
    getMembership,
    requireMembership,
    requireOrganizationRole,
  }
}

export type AuthorizationService = ReturnType<typeof createAuthorizationService>
