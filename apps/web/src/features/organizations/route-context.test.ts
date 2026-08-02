import { describe, expect, it } from "vitest"

import { resolveOrganizationRouteContext } from "./route-context"
import type { OrganizationSummary } from "./schema"

const permissions = {
  canDeleteOrganization: false,
  canEditOrganization: false,
  canInviteMembers: false,
  canManageAdmins: false,
  canManageMembers: false,
  canTransferOwnership: false,
}

const organizations: OrganizationSummary[] = [
  {
    id: "org-acme",
    name: "Acme",
    slug: "acme",
    role: "member",
    active: true,
    profileImage: null,
    memberCount: 1,
    memberProfileImages: [],
    permissions,
  },
  {
    id: "org-beta",
    name: "Beta",
    slug: "beta",
    role: "member",
    active: false,
    profileImage: null,
    memberCount: 1,
    memberProfileImages: [],
    permissions,
  },
]

describe("resolveOrganizationRouteContext", () => {
  it("uses the active organization outside an organization route", () => {
    expect(
      resolveOrganizationRouteContext("/settings/organizations", organizations)
    ).toMatchObject({
      activeOrganization: { id: "org-acme" },
      contextOrganization: { id: "org-acme" },
      contextMismatch: false,
    })
  })

  it("freezes tenant tools on a known inactive organization route", () => {
    expect(
      resolveOrganizationRouteContext(
        "/organization/beta/issues",
        organizations
      )
    ).toMatchObject({
      activeOrganization: { id: "org-acme" },
      contextOrganization: { id: "org-beta" },
      contextMismatch: true,
    })
  })

  it("fails closed for an unknown organization slug", () => {
    expect(
      resolveOrganizationRouteContext(
        "/organization/not-a-member/issues",
        organizations
      )
    ).toMatchObject({
      activeOrganization: { id: "org-acme" },
      contextOrganization: undefined,
      contextMismatch: true,
    })
  })
})
