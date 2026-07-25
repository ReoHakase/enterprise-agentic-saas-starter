import { publicErrors } from "../../errors/app-error"
import type { AuthorizationPorts, MembershipQuery } from "./ports"
import type { OrganizationRole } from "./roles"

export const createAuthorizationService = (ports: AuthorizationPorts) => {
  const getMembership = (input: MembershipQuery) => ports.findMembership(input)

  const requireMembership = async (input: MembershipQuery) => {
    const membership = await getMembership(input)
    if (!membership) {
      // organizationの存在と「他tenantに存在する」ことを区別させない。
      throw publicErrors.notFound("Organization not found", {
        resource: "organization",
      })
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
      throw publicErrors.forbidden(
        "You are not allowed to perform this action",
        { action: input.action }
      )
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
