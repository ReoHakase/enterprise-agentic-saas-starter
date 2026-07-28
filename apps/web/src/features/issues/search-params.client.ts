"use client"

import { useSearchParams } from "next/navigation"
import { parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs"

import type { SetIssueSearchState } from "./search-params"
import {
  createIssueTableSearchParams,
  issueSearchParsers,
  normalizeIssueSearchState,
} from "./search-params.shared"

const clientIssueTableSearchParams = createIssueTableSearchParams()
const legacyPriorityParser = parseAsStringLiteral([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const)
const clientIssueSearchUrlKeys = {
  ...clientIssueTableSearchParams.urlKeys,
  agentThread: "agentThread",
}

export const useIssueSearchState = () => {
  const searchParams = useSearchParams()
  const [state, setState] = useQueryStates(issueSearchParsers, {
    history: "replace",
    shallow: true,
    urlKeys: clientIssueSearchUrlKeys,
  })
  const [, setLegacyPriority] = useQueryState(
    "priority",
    legacyPriorityParser.withOptions({ history: "replace", shallow: true })
  )
  const normalizedState = normalizeIssueSearchState(state, searchParams)
  const migrateLegacyDueOffset = searchParams.has("dueOffset")
    ? {
        dueFromOffset: normalizedState.dueFromOffset,
        dueToOffset: normalizedState.dueToOffset,
        dueOffset: null,
      }
    : { dueOffset: null }

  const setSearch: SetIssueSearchState = async (values, options) => {
    const next = setState(
      { ...migrateLegacyDueOffset, ...values },
      {
        history: "replace",
        ...options,
      }
    )
    await setLegacyPriority(null, { history: "replace", ...options })
    return next
  }
  const setDiscrete: SetIssueSearchState = async (values, options) => {
    const next = setState(
      { ...migrateLegacyDueOffset, ...values },
      { history: "push", ...options }
    )
    await setLegacyPriority(null, { history: "push", ...options })
    return next
  }

  return {
    state: normalizedState,
    setState: setSearch,
    setSearch,
    setDiscrete,
  }
}
