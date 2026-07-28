import { createSearchParamsCache } from "nuqs/server"

import {
  issueSearchParsers,
  issueSearchUrlKeys,
  normalizeIssueSearchState,
} from "./search-params.shared"

const rawIssueSearchParamsCache = createSearchParamsCache(issueSearchParsers, {
  urlKeys: issueSearchUrlKeys,
})

const toIssueSearchSource = (source: unknown) => {
  if (source instanceof URLSearchParams) return source
  if (!source || typeof source !== "object") return undefined
  const normalized: Record<string, string | string[] | undefined> = {}
  for (const [key, value] of Object.entries(source)) {
    if (
      value === undefined ||
      typeof value === "string" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    ) {
      Reflect.set(normalized, key, value)
    }
  }
  return normalized
}

export const issueSearchParamsCache = {
  parse: async (
    ...args: Parameters<typeof rawIssueSearchParamsCache.parse>
  ) => {
    const source = await args[0]
    const state = await rawIssueSearchParamsCache.parse(...args)
    return normalizeIssueSearchState(state, toIssueSearchSource(source))
  },
}
