import { createSearchParamsCache } from "nuqs/server"

import { issueSearchParsers } from "./search-params.shared"

export const issueSearchParamsCache =
  createSearchParamsCache(issueSearchParsers)
