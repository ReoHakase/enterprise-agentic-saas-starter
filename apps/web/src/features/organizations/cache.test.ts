import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import type { Me } from "@/features/account"
import { agentKeys } from "@/features/agent"
import { consoleKeys } from "@/features/console"
import { fileKeys, registerFileUpload } from "@/features/files"
import { issueKeys } from "@/features/issues"

import { prepareOrganizationSwitch } from "./cache"
import type { OrganizationSummary } from "./schema"

const permissions = {
  canDeleteOrganization: true,
  canEditOrganization: true,
  canInviteMembers: true,
  canManageAdmins: true,
  canManageMembers: true,
  canTransferOwnership: true,
}

const organizations: OrganizationSummary[] = [
  {
    id: "org-alpha",
    name: "Alpha",
    slug: "alpha",
    role: "owner",
    active: true,
    profileImage: null,
    memberCount: 2,
    memberProfileImages: [],
    permissions,
  },
  {
    id: "org-beta",
    name: "Beta",
    slug: "beta",
    role: "admin",
    active: false,
    profileImage: null,
    memberCount: 3,
    memberProfileImages: [],
    permissions,
  },
]

const me: Me = {
  activeOrganizationId: "org-alpha",
  organizations,
  user: {
    id: "user-1",
    name: "User",
    email: "user@example.test",
    profileImage: null,
  },
}

describe("組織query cache", () => {
  it("古いテナントdataを再取得せず組織・個人cacheを更新する", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(consoleKeys.organizations(), organizations)
    queryClient.setQueryData(consoleKeys.me(), me)

    await prepareOrganizationSwitch(queryClient, "org-beta")

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

  it("route別の個人cacheも切替先組織へ更新する", async () => {
    // Given: console route固有のredirect先をsuffixに持つme queryがある。
    const queryClient = new QueryClient()
    const routeMeKey = [
      ...consoleKeys.me(),
      "/organization/beta/dashboard",
    ] as const
    queryClient.setQueryData(routeMeKey, me)

    // When: active organizationを切り替える。
    await prepareOrganizationSwitch(queryClient, "org-beta")

    // Then: 同じprefixのroute別cacheも旧tenantを保持しない。
    expect(queryClient.getQueryData<Me>(routeMeKey)).toMatchObject({
      activeOrganizationId: "org-beta",
      organizations: [
        { id: "org-alpha", active: false },
        { id: "org-beta", active: true },
      ],
    })
  })

  it("現在のテナントquery familyをすべてキャンセルする", async () => {
    const queryClient = new QueryClient()
    const cancelQueries = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue()

    await prepareOrganizationSwitch(queryClient, "org-beta")

    expect(cancelQueries.mock.calls.map(([filters]) => filters)).toEqual(
      expect.arrayContaining([
        { queryKey: consoleKeys.all },
        { queryKey: fileKeys.all },
        { queryKey: issueKeys.all },
        { queryKey: agentKeys.all },
      ])
    )
  })

  it("進行中のfile uploadを中止する", async () => {
    const queryClient = new QueryClient()
    const uploadController = new AbortController()
    registerFileUpload(uploadController)
    vi.spyOn(queryClient, "cancelQueries").mockResolvedValue()

    await prepareOrganizationSwitch(queryClient, "org-beta")

    expect(uploadController.signal.aborted).toBe(true)
  })

  it("queryのキャンセル後に非active cacheを削除する", async () => {
    const queryClient = new QueryClient()
    const cancelQueries = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue()
    const removeQueries = vi.spyOn(queryClient, "removeQueries")

    await prepareOrganizationSwitch(queryClient, "org-beta")

    expect(removeQueries).toHaveBeenCalledTimes(2)
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: fileKeys.all,
      type: "inactive",
    })
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: agentKeys.all,
      type: "inactive",
    })
    expect(removeQueries.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...cancelQueries.mock.invocationCallOrder)
    )
  })
})
