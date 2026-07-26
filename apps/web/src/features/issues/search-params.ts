import { useQueryStates, type SetValues } from "nuqs"

import { issueSearchParsers } from "./search-params.shared"

export * from "./search-params.shared"

export type SetIssueSearchState = SetValues<typeof issueSearchParsers>

export const useIssueSearchState = () => {
  const [state, setState] = useQueryStates(issueSearchParsers, {
    history: "replace",
    shallow: true,
  })

  const setSearch: SetIssueSearchState = (values, options) =>
    setState(values, {
      history: "replace",
      ...options,
    })
  const setDiscrete: SetIssueSearchState = (values, options) =>
    setState(values, { history: "push", ...options })

  return { state, setState, setSearch, setDiscrete }
}
