import {
  createMultiParser,
  createParser,
  createSerializer,
  parseAsInteger,
  parseAsStringLiteral,
  type inferParserType,
  type UrlKeys,
} from "nuqs/server"

import { createDataTableUrlKeys } from "@/components/data-table/data-table-url-state"

const issueStatuses = ["open", "in_progress", "closed"] as const
const issuePriorities = [
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
const labelModes = ["any", "all"] as const
const pageSizes = ["20", "50", "100"] as const

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

const timezoneOffsetParser = createParser({
  parse: (value) => {
    const offset = parseAsInteger.parse(value)
    return offset !== null && offset >= -840 && offset <= 840 ? offset : null
  },
  serialize: String,
})

const isoDateParser = createParser({
  parse: (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
      ? null
      : value
  },
  serialize: String,
})

const canonicalValues = (
  values: readonly string[],
  maximumLength: number,
  order?: readonly string[],
  maximumCount?: number
) => {
  const unique = new Map<string, string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > maximumLength) continue
    if (order && !order.includes(trimmed)) continue
    const key = trimmed.toLocaleLowerCase("en-US")
    if (!unique.has(key)) unique.set(key, trimmed)
  }
  return [...unique.values()]
    .toSorted((left, right) => {
      if (order) return order.indexOf(left) - order.indexOf(right)
      return left.localeCompare(right, "en-US", { sensitivity: "base" })
    })
    .slice(0, maximumCount)
}

const canonicalArrayParser = (
  maximumLength: number,
  order?: readonly string[],
  maximumCount?: number
) =>
  createMultiParser({
    parse: (values) =>
      canonicalValues(values, maximumLength, order, maximumCount),
    serialize: (values) =>
      canonicalValues(values, maximumLength, order, maximumCount),
    eq: (left, right) =>
      JSON.stringify(
        canonicalValues(left, maximumLength, order, maximumCount)
      ) ===
      JSON.stringify(
        canonicalValues(right, maximumLength, order, maximumCount)
      ),
  }).withDefault([])

const canonicalStatuses = (
  values: readonly string[]
): Array<(typeof issueStatuses)[number]> =>
  canonicalValues(values, 32, issueStatuses).flatMap((value) =>
    value === "open" || value === "in_progress" || value === "closed"
      ? [value]
      : []
  )

const parsePageSize = (value: string): 20 | 50 | 100 => {
  if (value === "50") return 50
  if (value === "100") return 100
  return 20
}

const isIssuePriority = (
  value: string | null | undefined
): value is (typeof issuePriorities)[number] =>
  value === "no_priority" ||
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "urgent"

const issueTableSearchParsers = {
  q: boundedString(200).withDefault(""),
  statuses: canonicalArrayParser(32, issueStatuses),
  priorityFrom:
    parseAsStringLiteral(issuePriorities).withDefault("no_priority"),
  priorityTo: parseAsStringLiteral(issuePriorities).withDefault("urgent"),
  assignees: canonicalArrayParser(128, undefined, 50),
  labels: canonicalArrayParser(40, undefined, 20),
  labelMode: parseAsStringLiteral(labelModes).withDefault("any"),
  dueFrom: isoDateParser.withDefault(""),
  dueTo: isoDateParser.withDefault(""),
  dueFromOffset: timezoneOffsetParser.withDefault(0),
  dueToOffset: timezoneOffsetParser.withDefault(0),
  dueOffset: timezoneOffsetParser.withDefault(0),
  sort: parseAsStringLiteral(issueSorts).withDefault("updatedAt"),
  dir: parseAsStringLiteral(sortDirections).withDefault("desc"),
  page: positivePageParser.withDefault(1),
  pageSize: parseAsStringLiteral(pageSizes).withDefault("20"),
}

const agentThreadParser = boundedString(128).withDefault("")

export const createIssueTableSearchParams = (prefix?: string) => {
  const genericUrlKeys = createDataTableUrlKeys(issueTableSearchParsers, {
    prefix,
  })
  const legacyAliases = createDataTableUrlKeys(
    {
      status: issueTableSearchParsers.statuses,
      assignee: issueTableSearchParsers.assignees,
      label: issueTableSearchParsers.labels,
    },
    { prefix }
  )
  const urlKeys = {
    ...genericUrlKeys,
    statuses: legacyAliases.status,
    assignees: legacyAliases.assignee,
    labels: legacyAliases.label,
  } satisfies UrlKeys<typeof issueTableSearchParsers>

  return {
    parsers: issueTableSearchParsers,
    serialize: createSerializer(issueTableSearchParsers, { urlKeys }),
    urlKeys,
  }
}

const issueTableSearchParams = createIssueTableSearchParams()

export const issueSearchParsers = {
  ...issueTableSearchParsers,
  agentThread: agentThreadParser,
}

export const issueSearchUrlKeys = {
  ...issueTableSearchParams.urlKeys,
  agentThread: "agentThread",
} satisfies UrlKeys<typeof issueSearchParsers>

export type IssueSearchState = inferParserType<typeof issueSearchParsers>

export const defaultIssueSearchState: IssueSearchState = {
  q: "",
  statuses: [],
  priorityFrom: "no_priority",
  priorityTo: "urgent",
  assignees: [],
  labels: [],
  labelMode: "any",
  dueFrom: "",
  dueTo: "",
  dueFromOffset: 0,
  dueToOffset: 0,
  dueOffset: 0,
  sort: "updatedAt",
  dir: "desc",
  page: 1,
  pageSize: "20",
  agentThread: "",
}

export const normalizeIssueSearchState = (
  state: IssueSearchState,
  source?: URLSearchParams | Record<string, string | string[] | undefined>
): IssueSearchState => {
  const hasSourceKey = (key: string) =>
    source instanceof URLSearchParams
      ? source.has(key)
      : source
        ? source[key] !== undefined
        : false
  const sourceValue = (key: string) => {
    const value =
      source instanceof URLSearchParams ? source.get(key) : source?.[key]
    return Array.isArray(value) ? value[0] : value
  }
  const legacyPriority = sourceValue("priority")
  const useLegacyPriority =
    !hasSourceKey("priorityFrom") &&
    !hasSourceKey("priorityTo") &&
    isIssuePriority(legacyPriority)
  const requestedPriorityFrom = useLegacyPriority
    ? legacyPriority
    : state.priorityFrom
  const requestedPriorityTo = useLegacyPriority
    ? legacyPriority
    : state.priorityTo
  const priorityFromIndex = issuePriorities.indexOf(requestedPriorityFrom)
  const priorityToIndex = issuePriorities.indexOf(requestedPriorityTo)
  const [priorityFrom, priorityTo] =
    priorityFromIndex <= priorityToIndex
      ? [requestedPriorityFrom, requestedPriorityTo]
      : [requestedPriorityTo, requestedPriorityFrom]
  const hasReversedDueRange =
    Boolean(state.dueFrom && state.dueTo) && state.dueFrom > state.dueTo
  const clearDueRange = hasReversedDueRange
  const legacyDueOffset = hasSourceKey("dueOffset")
    ? state.dueOffset
    : state.dueOffset === 0
      ? undefined
      : state.dueOffset
  const dueFrom = clearDueRange ? "" : state.dueFrom
  const dueTo = clearDueRange ? "" : state.dueTo
  const dueFromOffset = clearDueRange
    ? 0
    : hasSourceKey("dueFromOffset")
      ? state.dueFromOffset
      : (legacyDueOffset ?? state.dueFromOffset)
  const dueToOffset = clearDueRange
    ? 0
    : hasSourceKey("dueToOffset")
      ? state.dueToOffset
      : (legacyDueOffset ?? state.dueToOffset)

  return {
    ...state,
    q: state.q.trim(),
    statuses: canonicalStatuses(state.statuses),
    priorityFrom,
    priorityTo,
    assignees: canonicalValues(state.assignees, 128, undefined, 50),
    labels: canonicalValues(state.labels, 40, undefined, 20),
    dueFrom,
    dueTo,
    dueFromOffset,
    dueToOffset,
    dueOffset: 0,
  }
}

export const serializeIssueSearchParams = createSerializer(issueSearchParsers, {
  urlKeys: issueSearchUrlKeys,
})

export type IssueSearchPatch = Partial<Omit<IssueSearchState, "agentThread">>

const mergeIssueSearchPatch = (
  current: IssueSearchState,
  patch: IssueSearchPatch
): IssueSearchState =>
  normalizeIssueSearchState({
    ...current,
    ...patch,
    page: patch.page ?? 1,
    agentThread: current.agentThread,
  })

export const withAgentThreadHref = (href: string, agentThread: string) =>
  agentThread
    ? `${href}${href.includes("?") ? "&" : "?"}agentThread=${encodeURIComponent(agentThread)}`
    : href

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
  statuses?: Array<(typeof issueStatuses)[number]>
  priorityFrom?: IssueSearchState["priorityFrom"]
  priorityTo?: IssueSearchState["priorityTo"]
  assigneeIds?: string[]
  labels?: string[]
  labelMode?: IssueSearchState["labelMode"]
  dueDateFrom?: string
  dueDateTo?: string
  dueDateFromOffsetMinutes?: number
  dueDateToExclusiveOffsetMinutes?: number
  sortBy: IssueSearchState["sort"]
  sortDirection: IssueSearchState["dir"]
  page: number
  pageSize: 20 | 50 | 100
}

export const toIssueListRequest = (
  organizationId: string,
  input: IssueSearchState
): IssueListRequest => {
  const state = normalizeIssueSearchState(input)
  const fullPriorityRange =
    state.priorityFrom === "no_priority" && state.priorityTo === "urgent"
  return {
    organizationId,
    search: state.q || undefined,
    statuses:
      state.statuses.length > 0 ? canonicalStatuses(state.statuses) : undefined,
    priorityFrom: fullPriorityRange ? undefined : state.priorityFrom,
    priorityTo: fullPriorityRange ? undefined : state.priorityTo,
    assigneeIds: state.assignees.length > 0 ? state.assignees : undefined,
    labels: state.labels.length > 0 ? state.labels : undefined,
    labelMode: state.labels.length > 0 ? state.labelMode : undefined,
    dueDateFrom: state.dueFrom || undefined,
    dueDateTo: state.dueTo || undefined,
    dueDateFromOffsetMinutes: state.dueFrom ? state.dueFromOffset : undefined,
    dueDateToExclusiveOffsetMinutes: state.dueTo
      ? state.dueToOffset
      : undefined,
    sortBy: state.sort,
    sortDirection: state.dir,
    page: state.page,
    pageSize: parsePageSize(state.pageSize),
  }
}

export const issueListQueryKeyState = (input: IssueSearchState) => {
  const state = normalizeIssueSearchState(input)
  return {
    q: state.q,
    statuses: state.statuses,
    priorityFrom: state.priorityFrom,
    priorityTo: state.priorityTo,
    assignees: state.assignees,
    labels: state.labels,
    labelMode: state.labelMode,
    dueFrom: state.dueFrom,
    dueTo: state.dueTo,
    dueFromOffset: state.dueFromOffset,
    dueToOffset: state.dueToOffset,
    sort: state.sort,
    dir: state.dir,
    page: state.page,
    pageSize: Number(state.pageSize),
  }
}
