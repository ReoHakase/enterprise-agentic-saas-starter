import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import type { Me } from "@/features/account/schema"
import { consoleKeys } from "@/features/console/queries"
import { issueKeys } from "@/features/issues/queries"
import type { OrganizationSummary } from "@/features/organizations/schema"

import { cacheActiveOrganization, prepareOrganizationSwitch } from "./cache"

const permissions = {
  canDeleteOrganization: true,
  canEditOrganization: true,
  canInviteMembers: true,
  canManageAdmins: true,
  canManageMembers: true,
  canTransferSuperAdmin: true,
}

const organizations: OrganizationSummary[] = [
  {
    id: "org-alpha",
    name: "Alpha",
    slug: "alpha",
    role: "super_admin",
    active: true,
    memberCount: 2,
    memberAvatars: [],
    permissions,
  },
  {
    id: "org-beta",
    name: "Beta",
    slug: "beta",
    role: "admin",
    active: false,
    memberCount: 3,
    memberAvatars: [],
    permissions,
  },
]

describe("organization query cache", () => {
  it("updates organization and me caches without refetching old tenant data", () => {
    const queryClient = new QueryClient()
    const me: Me = {
      activeOrganizationId: "org-alpha",
      organizations,
      user: {
        id: "user-1",
        name: "User",
        email: "user@example.test",
        image: null,
      },
    }
    queryClient.setQueryData(consoleKeys.organizations(), organizations)
    queryClient.setQueryData(consoleKeys.me(), me)

    cacheActiveOrganization(queryClient, "org-beta")

    expect(
      queryClient
        .getQueryData<OrganizationSummary[]>(consoleKeys.organizations())
        ?.map(({ id, active }) => ({ id, active }))
    ).toEqual([
      { id: "org-alpha", active: false },
      { id: "org-beta", active: true },
    ])
    expect(queryClient.getQueryData<Me>(consoleKeys.me())).toMatchObject({
      activeOrganizationId: "org-beta",
      organizations: [
        { id: "org-alpha", active: false },
        { id: "org-beta", active: true },
      ],
    })
  })

  it("cancels every current tenant query family before syncing the active cache", async () => {
    const queryClient = new QueryClient()
    const cancelQueries = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue()

    await prepareOrganizationSwitch(queryClient, "org-beta")

    expect(cancelQueries).toHaveBeenCalledTimes(2)
    expect(cancelQueries).toHaveBeenNthCalledWith(1, {
      queryKey: consoleKeys.all,
    })
    expect(cancelQueries).toHaveBeenNthCalledWith(2, {
      queryKey: issueKeys.all,
    })
  })
})
