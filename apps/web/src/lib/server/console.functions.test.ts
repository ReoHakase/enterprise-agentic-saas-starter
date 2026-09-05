import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { consoleKeys } from "@/features/console"
import { issueKeys } from "@/features/issues"
import {
  fictionalIssueListItem,
  fictionalIssueSearchState,
} from "@/features/issues/test-support/fixtures"
import { fictionalMembers } from "@/features/members/test-support/fixtures"
import { fictionalOrganization } from "@/features/organizations/test-support/fixtures"

import {
  consumeOrganizationIssuesRouteQuery,
  organizationIssuesQueryOptions,
} from "./console.functions"

const activeRouteData = {
  currentUserId: "user_01K1AVERY00000000000000",
  inactive: false as const,
  issues: {
    items: [fictionalIssueListItem],
    page: 1,
    pageSize: 20 as const,
    total: 1,
  },
  members: fictionalMembers,
  organization: fictionalOrganization,
  searchState: fictionalIssueSearchState,
}

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe("Issue一覧route query", () => {
  it("取得結果をdomain cacheへ移してroute bundleを残さない", async () => {
    // Given: active organizationのIssue一覧route queryがある。
    const queryClient = createQueryClient()
    const queryFn = vi
      .fn<() => Promise<typeof activeRouteData>>()
      .mockResolvedValue(activeRouteData)
    const options = {
      ...organizationIssuesQueryOptions(fictionalOrganization.slug, ""),
      queryFn,
    }

    // When: route loaderがqueryを消費する。
    await expect(
      consumeOrganizationIssuesRouteQuery(queryClient, options)
    ).resolves.toEqual(activeRouteData)

    // Then: component用domain cacheだけを残す。
    expect(queryFn).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(options.queryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData(
        issueKeys.list(fictionalOrganization.id, fictionalIssueSearchState)
      )
    ).toEqual(activeRouteData.issues)
    expect(
      queryClient.getQueryData(consoleKeys.members(fictionalOrganization.id))
    ).toEqual(fictionalMembers)
  })

  it("inactive結果でもroute bundleを残さない", async () => {
    // Given: activeでないorganizationのroute queryがある。
    const queryClient = createQueryClient()
    const inactiveRouteData = {
      inactive: true as const,
      organization: { ...fictionalOrganization, active: false },
    }
    const options = {
      ...organizationIssuesQueryOptions(fictionalOrganization.slug, ""),
      queryFn: vi
        .fn<() => Promise<typeof inactiveRouteData>>()
        .mockResolvedValue(inactiveRouteData),
    }

    // When: route loaderがqueryを消費する。
    await consumeOrganizationIssuesRouteQuery(queryClient, options)

    // Then: 組織切替後の再訪を妨げるinactive bundleを残さない。
    expect(queryClient.getQueryData(options.queryKey)).toBeUndefined()
  })

  it("mutation後の再訪で古いroute bundleを再利用しない", async () => {
    // Given: 初回route取得後、domain listがmutation結果へ更新された。
    const queryClient = createQueryClient()
    const updatedIssues = { ...activeRouteData.issues, items: [] }
    const queryFn = vi
      .fn<() => Promise<typeof activeRouteData>>()
      .mockResolvedValueOnce(activeRouteData)
      .mockResolvedValueOnce({ ...activeRouteData, issues: updatedIssues })
    const options = {
      ...organizationIssuesQueryOptions(fictionalOrganization.slug, ""),
      queryFn,
    }
    await consumeOrganizationIssuesRouteQuery(queryClient, options)
    queryClient.setQueryData(
      issueKeys.list(fictionalOrganization.id, fictionalIssueSearchState),
      updatedIssues
    )

    // When: 別routeからIssue一覧へ戻る。
    await consumeOrganizationIssuesRouteQuery(queryClient, options)

    // Then: serverを再取得し、mutation後の一覧を保持する。
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(
      queryClient.getQueryData(
        issueKeys.list(fictionalOrganization.id, fictionalIssueSearchState)
      )
    ).toEqual(updatedIssues)
    expect(queryClient.getQueryData(options.queryKey)).toBeUndefined()
  })
})
