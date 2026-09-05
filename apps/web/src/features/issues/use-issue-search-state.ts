"use client"

import { useQueryStates } from "nuqs"

import type { SetIssueSearchState } from "./search-params"
import {
  createIssueTableSearchParams,
  issueSearchParsers,
  normalizeIssueSearchState,
} from "./search-params.shared"

const clientIssueTableSearchParams = createIssueTableSearchParams()
const clientIssueSearchUrlKeys = {
  ...clientIssueTableSearchParams.urlKeys,
  agentThread: "agentThread",
}

export const useIssueSearchState = () => {
  const [state, setState] = useQueryStates(issueSearchParsers, {
    history: "replace",
    shallow: true,
    urlKeys: clientIssueSearchUrlKeys,
  })
  const normalizedState = normalizeIssueSearchState(state)

  const setSearch: SetIssueSearchState = async (values, options) =>
    setState(values, { history: "replace", ...options })
  const setDiscrete: SetIssueSearchState = async (values, options) =>
    setState(values, { history: "push", ...options })

  return {
    state: normalizedState,
    setState: setSearch,
    setSearch,
    setDiscrete,
  }
}
