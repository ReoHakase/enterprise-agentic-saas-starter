import type { SetValues } from "nuqs"

export * from "./search-params.shared"

import type { issueSearchParsers } from "./search-params.shared"

export type SetIssueSearchState = SetValues<typeof issueSearchParsers>
