import { notFound } from "next/navigation"

import { ConsoleApiError } from "@/features/console"
import {
  getIssueByNumber,
  getIssueTimeline,
  listIssues,
  deriveIssueLabelSuggestions,
} from "@/features/issues"
import type { IssueAssigneeOption } from "@/features/issues"

import { createServerApiClient } from "./api-client"
import { getCookieHeader } from "./auth"
import { createServerConsoleApi } from "./console-api"
import { getConsoleContext } from "./console-context"

export const loadIssueDetail = async (
  organizationSlug: string,
  issueNumber: number
) => {
  if (!Number.isInteger(issueNumber) || issueNumber < 1) notFound()

  const [{ me }, cookie, consoleApi] = await Promise.all([
    getConsoleContext(),
    getCookieHeader(),
    createServerConsoleApi(),
  ])
  const organization = me.organizations.find(
    (candidate) => candidate.slug === organizationSlug
  )
  if (!organization) notFound()

  if (!organization.active) {
    return { organization, inactive: true as const }
  }

  const client = createServerApiClient(cookie)
  let issue
  try {
    issue = await getIssueByNumber(client, {
      organizationId: organization.id,
      number: issueNumber,
    })
  } catch (error) {
    if (error instanceof ConsoleApiError && error.status === 404) notFound()
    throw error
  }
  const [timeline, members, issues] = await Promise.all([
    getIssueTimeline(client, {
      id: issue.id,
      organizationId: organization.id,
      limit: 50,
    }),
    consoleApi.listMembers(organization.id),
    listIssues(client, organization.id),
  ])
  const assignees: IssueAssigneeOption[] = members.map((member) => ({
    id: member.userId,
    name: member.name,
    email: member.email,
    profileImage: member.profileImage,
  }))

  return {
    organization,
    inactive: false as const,
    issue,
    timeline,
    assignees,
    labelSuggestions: deriveIssueLabelSuggestions(issues),
  }
}
