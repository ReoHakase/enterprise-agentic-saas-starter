import {
  createLoader,
  createParser,
  createSerializer,
  parseAsInteger,
  parseAsStringLiteral,
} from "nuqs/server"

const issueStatuses = ["all", "open", "in_progress", "closed"] as const
const issuePriorities = [
  "all",
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const
const issueSorts = [
  "number",
  "createdAt",
  "updatedAt",
  "dueDate",
  "priority",
  "status",
] as const
const sortDirections = ["asc", "desc"] as const

const boundedString = (maximumLength: number) =>
  createParser({
    parse: (value) => (value.length <= maximumLength ? value : null),
    serialize: String,
  })

const positivePageParser = createParser({
  parse: (value) => {
    const page = parseAsInteger.parse(value)
    return page !== null && page > 0 && page <= 100_000 ? page : null
  },
  serialize: String,
})

export const issueSearchParsers = {
  q: boundedString(200).withDefault(""),
  status: parseAsStringLiteral(issueStatuses).withDefault("all"),
  priority: parseAsStringLiteral(issuePriorities).withDefault("all"),
  assignee: boundedString(128).withDefault(""),
  label: boundedString(40).withDefault(""),
  sort: parseAsStringLiteral(issueSorts).withDefault("updatedAt"),
  dir: parseAsStringLiteral(sortDirections).withDefault("desc"),
  page: positivePageParser.withDefault(1),
  agentThread: boundedString(128).withDefault(""),
}

export type IssueSearchState = {
  [Key in keyof typeof issueSearchParsers]: NonNullable<
    ReturnType<(typeof issueSearchParsers)[Key]["parse"]>
  >
}

export const defaultIssueSearchState: IssueSearchState = {
  q: "",
  status: "all",
  priority: "all",
  assignee: "",
  label: "",
  sort: "updatedAt",
  dir: "desc",
  page: 1,
  agentThread: "",
}

export const loadIssueSearchParams = createLoader(issueSearchParsers)
export const serializeIssueSearchParams = createSerializer(issueSearchParsers)

export type IssueSearchPatch = Partial<Omit<IssueSearchState, "agentThread">>

export const mergeIssueSearchPatch = (
  current: IssueSearchState,
  patch: IssueSearchPatch
): IssueSearchState => ({
  q: patch.q ?? current.q,
  status: patch.status ?? current.status,
  priority: patch.priority ?? current.priority,
  assignee: patch.assignee ?? current.assignee,
  label: patch.label ?? current.label,
  sort: patch.sort ?? current.sort,
  dir: patch.dir ?? current.dir,
  page: patch.page ?? 1,
  agentThread: "",
})

export const buildIssueListHref = (
  organizationSlug: string,
  current: IssueSearchState,
  patch: IssueSearchPatch
) => {
  const state = mergeIssueSearchPatch(current, patch)
  return {
    href: `/organization/${encodeURIComponent(organizationSlug)}/issues${serializeIssueSearchParams(state)}`,
    state,
  }
}

export type IssueListRequest = {
  organizationId: string
  search?: string
  status?: Exclude<IssueSearchState["status"], "all">
  priority?: Exclude<IssueSearchState["priority"], "all">
  assigneeId?: string
  label?: string
  sortBy: IssueSearchState["sort"]
  sortDirection: IssueSearchState["dir"]
  page: number
}

export const toIssueListRequest = (
  organizationId: string,
  state: IssueSearchState
): IssueListRequest => ({
  organizationId,
  search: state.q.trim() || undefined,
  status: state.status === "all" ? undefined : state.status,
  priority: state.priority === "all" ? undefined : state.priority,
  assigneeId: state.assignee || undefined,
  label: state.label.trim() || undefined,
  sortBy: state.sort,
  sortDirection: state.dir,
  page: state.page,
})

export const issueListQueryKeyState = (state: IssueSearchState) => ({
  q: state.q.trim(),
  status: state.status,
  priority: state.priority,
  assignee: state.assignee,
  label: state.label.trim(),
  sort: state.sort,
  dir: state.dir,
  page: state.page,
})
