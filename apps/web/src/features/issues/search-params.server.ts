import { createSearchParamsCache } from "nuqs/server"

import {
  issueSearchParsers,
  issueSearchUrlKeys,
  normalizeIssueSearchState,
} from "./search-params.shared"

const rawIssueSearchParamsCache = createSearchParamsCache(issueSearchParsers, {
  urlKeys: issueSearchUrlKeys,
})

export const issueSearchParamsCache = {
  parse: async (
    ...args: Parameters<typeof rawIssueSearchParamsCache.parse>
  ) => {
    const state = await rawIssueSearchParamsCache.parse(...args)
    return normalizeIssueSearchState(state)
  },
}
