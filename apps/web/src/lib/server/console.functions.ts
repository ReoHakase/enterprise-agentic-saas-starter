import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { setResponseHeader } from "@tanstack/react-start/server"
import * as v from "valibot"

import {
  consoleKeys,
  getConsoleApiErrorText,
  isHttpErrorStatus,
} from "@/features/console"
import {
  defaultIssueSearchState,
  deriveIssueLabelSuggestions,
  getIssueByNumber,
  getIssueTimeline,
  issueKeys,
  listIssues,
  toIssueListRequest,
  type IssueAssigneeOption,
} from "@/features/issues"
import { loadIssueSearchParams } from "@/features/issues/search-params.shared"
import type { OrganizationInvitation } from "@/features/members"
import { reportObservedError } from "@/lib/report-observed-error"
import { createServerApiClient } from "@/lib/server/api-client"
import { getCookieHeader } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"
import { getConsoleContext } from "@/lib/server/console-context"

const routeText = v.pipe(v.string(), v.minLength(1), v.maxLength(4_096))
const redirectUrlText = v.pipe(v.string(), v.minLength(1), v.maxLength(32_768))
const organizationInputSchema = v.object({ organizationSlug: routeText })
const issuesInputSchema = v.object({
  organizationSlug: routeText,
  searchString: v.pipe(v.string(), v.maxLength(16_384)),
})
const issueDetailInputSchema = v.object({
  issueNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
  organizationSlug: routeText,
})
const consoleInputSchema = v.object({ redirectTo: redirectUrlText })

const noStore = () => setResponseHeader("Cache-Control", "no-store")

export const loadConsoleMe = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(consoleInputSchema, input))
  .handler(async ({ data }) => {
    noStore()
    const { me } = await getConsoleContext(data.redirectTo)
    return me
  })

export const consoleMeQueryOptions = (redirectTo: string) =>
  queryOptions({
    queryKey: [...consoleKeys.me(), redirectTo],
    queryFn: () => loadConsoleMe({ data: { redirectTo } }),
  })

const resolveOrganization = async (organizationSlug: string) => {
  const context = await getConsoleContext()
  const organization = context.me.organizations.find(
    (candidate) => candidate.slug === organizationSlug
  )

  if (!organization) throw notFound()

  return { ...context, organization }
}

export const loadOrganizationDashboard = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(organizationInputSchema, input))
  .handler(async ({ data }) => {
    noStore()
    const { organization } = await resolveOrganization(data.organizationSlug)
    if (!organization.active) return { inactive: true as const, organization }

    const apiClient = createServerApiClient(await getCookieHeader())
    const [allIssues, closedIssuePage] = await Promise.all([
      listIssues(
        apiClient,
        toIssueListRequest(organization.id, defaultIssueSearchState)
      ),
      listIssues(
        apiClient,
        toIssueListRequest(organization.id, {
          ...defaultIssueSearchState,
          statuses: ["closed"],
        })
      ),
    ])

    return {
      closedIssues: closedIssuePage.total,
      inactive: false as const,
      openIssues: allIssues.total - closedIssuePage.total,
      organization,
    }
  })

export const loadOrganizationIssues = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(issuesInputSchema, input))
  .handler(async ({ data }) => {
    noStore()
    const { me, organization } = await resolveOrganization(
      data.organizationSlug
    )
    if (!organization.active) {
      return { inactive: true as const, organization }
    }

    const searchState = loadIssueSearchParams(data.searchString)
    const apiClient = createServerApiClient(await getCookieHeader())
    const consoleApi = await createServerConsoleApi()
    const [issues, members] = await Promise.all([
      listIssues(apiClient, toIssueListRequest(organization.id, searchState)),
      consoleApi.listMembers(organization.id),
    ])

    return {
      currentUserId: me.user.id,
      inactive: false as const,
      issues,
      members,
      organization,
      searchState,
    }
  })

export const organizationIssuesQueryOptions = (
  organizationSlug: string,
  searchString: string
) =>
  queryOptions({
    queryKey: ["route", "organization-issues", organizationSlug, searchString],
    queryFn: () =>
      loadOrganizationIssues({ data: { organizationSlug, searchString } }),
  })

const hydrateOrganizationIssueQueries = (
  queryClient: QueryClient,
  data: Awaited<ReturnType<typeof loadOrganizationIssues>>
) => {
  if (data.inactive) return
  queryClient.setQueryData(
    issueKeys.list(data.organization.id, data.searchState),
    data.issues
  )
  queryClient.setQueryData(
    consoleKeys.members(data.organization.id),
    data.members
  )
}

export const consumeOrganizationIssuesRouteQuery = async (
  queryClient: QueryClient,
  options: ReturnType<typeof organizationIssuesQueryOptions>
) => {
  try {
    const data = await queryClient.ensureQueryData(options)
    hydrateOrganizationIssueQueries(queryClient, data)
    return data
  } finally {
    queryClient.removeQueries({ exact: true, queryKey: options.queryKey })
  }
}

export const loadOrganizationIssueDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(issueDetailInputSchema, input))
  .handler(async ({ data }) => {
    noStore()
    const { api, organization } = await resolveOrganization(
      data.organizationSlug
    )
    if (!organization.active) return { inactive: true as const, organization }

    const apiClient = createServerApiClient(await getCookieHeader())
    let issue
    try {
      issue = await getIssueByNumber(apiClient, {
        number: data.issueNumber,
        organizationId: organization.id,
      })
    } catch (error) {
      if (isHttpErrorStatus(error, 404)) {
        throw notFound()
      }
      throw error
    }

    const [timeline, members, issues] = await Promise.all([
      getIssueTimeline(apiClient, {
        id: issue.id,
        limit: 50,
        organizationId: organization.id,
      }),
      api.listMembers(organization.id),
      listIssues(apiClient, organization.id),
    ])
    const assignees: IssueAssigneeOption[] = members.map((member) => ({
      email: member.email,
      id: member.userId,
      name: member.name,
      profileImage: member.profileImage,
    }))

    return {
      assignees,
      inactive: false as const,
      issue,
      labelSuggestions: deriveIssueLabelSuggestions(issues),
      organization,
      timeline,
    }
  })

const noInvitations: OrganizationInvitation[] = []

export const loadOrganizationMembers = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(organizationInputSchema, input))
  .handler(async ({ data }) => {
    noStore()
    const { api, organization } = await resolveOrganization(
      data.organizationSlug
    )
    if (!organization.active) return { inactive: true as const, organization }

    const invitationsResult = organization.permissions.canInviteMembers
      ? api
          .listInvitations(organization.id)
          .then((invitations) => ({ error: undefined, invitations }))
          .catch((error: unknown) => {
            reportObservedError(error, {
              operation: "organization.invitation.list",
            })
            return {
              error: getConsoleApiErrorText(
                error,
                "Invitations could not be loaded."
              ),
              invitations: undefined,
            }
          })
      : Promise.resolve({ error: undefined, invitations: noInvitations })
    const [detail, members, invitations] = await Promise.all([
      api.getOrganization(organization.id),
      api.listMembers(organization.id),
      invitationsResult,
    ])

    return {
      inactive: false as const,
      invitations: invitations.invitations,
      invitationsError: invitations.error,
      members,
      organization: detail,
    }
  })

export const loadOrganizationSettings = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(organizationInputSchema, input))
  .handler(async ({ data }) => {
    noStore()
    const { api, organization } = await resolveOrganization(
      data.organizationSlug
    )
    if (!organization.active) return { inactive: true as const, organization }

    return {
      inactive: false as const,
      organization: await api.getOrganization(organization.id),
    }
  })
