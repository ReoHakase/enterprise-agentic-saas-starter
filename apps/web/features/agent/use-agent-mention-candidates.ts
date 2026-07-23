"use client"

import { useQuery } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { useMemo } from "react"

import type { AgentMentionValue } from "@/features/agent/components/agent-composer"
import { membersQueryOptions } from "@/features/console/queries"
import { issuesQueryOptions } from "@/features/issues/queries"
import { useIssueSearchState } from "@/features/issues/search-params"
import { apiClient } from "@/lib/api-client"

export const useAgentMentionCandidates = (organizationId: string) => {
  const pathname = usePathname()
  const { state: issueSearchState } = useIssueSearchState()
  const issuesQuery = useQuery(
    issuesQueryOptions(apiClient, organizationId, issueSearchState)
  )
  const membersQuery = useQuery(membersQueryOptions(organizationId))

  return useMemo<AgentMentionValue[]>(
    () => [
      { kind: "current_page", path: pathname, label: "Current page" },
      ...(issuesQuery.data?.items.slice(0, 6).map((issue) => ({
        kind: "issue" as const,
        id: issue.id,
        label: `Issue #${issue.number}: ${issue.title}`,
      })) ?? []),
      ...(membersQuery.data?.slice(0, 6).map((member) => ({
        kind: "member" as const,
        id: member.userId,
        label: member.name,
      })) ?? []),
    ],
    [issuesQuery.data, membersQuery.data, pathname]
  )
}
