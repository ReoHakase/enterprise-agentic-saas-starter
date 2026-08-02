"use client"

import {
  createParser,
  parseAsArrayOf,
  parseAsInteger,
  parseAsStringLiteral,
  useQueryStates,
  type inferParserType,
} from "nuqs"
import { useCallback, useEffect, useRef, useState } from "react"

import { createDataTableUrlKeys } from "@/components/data-table/data-table-url-state"

export const memberTableRoles = ["owner", "admin", "member"] as const
const memberLoginMethods = ["github", "passkey"] as const
const memberTableSorts = ["user", "joined", "role"] as const
export const invitationTableRoles = ["admin", "member"] as const
export const invitationTableStatuses = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "canceled",
] as const
const invitationTableSorts = [
  "email",
  "role",
  "status",
  "created",
  "expires",
  "inviter",
] as const
const sortDirections = ["asc", "desc"] as const
const pageSizes = ["20", "50", "100"] as const

const tableSearchParser = createParser({
  parse: (value) => (value.length <= 200 ? value : null),
  serialize: String,
}).withDefault("")
const tablePageParser = createParser({
  parse: (value) => {
    const page = parseAsInteger.parse(value)
    return page !== null && page > 0 && page <= 100_000 ? page : null
  },
  serialize: String,
}).withDefault(1)

const memberTableSearchParsers = {
  q: tableSearchParser,
  roles: parseAsArrayOf(parseAsStringLiteral(memberTableRoles)).withDefault([]),
  methods: parseAsArrayOf(parseAsStringLiteral(memberLoginMethods)).withDefault(
    []
  ),
  sort: parseAsStringLiteral(memberTableSorts).withDefault("user"),
  dir: parseAsStringLiteral(sortDirections).withDefault("asc"),
  page: tablePageParser,
  pageSize: parseAsStringLiteral(pageSizes).withDefault("20"),
}

const invitationTableSearchParsers = {
  q: tableSearchParser,
  roles: parseAsArrayOf(parseAsStringLiteral(invitationTableRoles)).withDefault(
    []
  ),
  statuses: parseAsArrayOf(
    parseAsStringLiteral(invitationTableStatuses)
  ).withDefault([]),
  sort: parseAsStringLiteral(invitationTableSorts).withDefault("created"),
  dir: parseAsStringLiteral(sortDirections).withDefault("desc"),
  page: tablePageParser,
  pageSize: parseAsStringLiteral(pageSizes).withDefault("20"),
}

const memberTableSearchUrlKeys = createDataTableUrlKeys(
  memberTableSearchParsers
)
const invitationTableSearchUrlKeys = createDataTableUrlKeys(
  invitationTableSearchParsers,
  { prefix: "inv" }
)

export type MemberTableSearchState = inferParserType<
  typeof memberTableSearchParsers
>
export type InvitationTableSearchState = inferParserType<
  typeof invitationTableSearchParsers
>

export const useMemberTableSearchState = () => {
  const [state, setState] = useQueryStates(memberTableSearchParsers, {
    history: "replace",
    shallow: true,
    urlKeys: memberTableSearchUrlKeys,
  })
  const setSearch = useCallback(
    (q: string) => setState({ q, page: 1 }, { history: "replace" }),
    [setState]
  )
  const setDiscrete = useCallback(
    (patch: Partial<MemberTableSearchState>) =>
      setState(patch, { history: "push" }),
    [setState]
  )

  return {
    state,
    setSearch,
    setDiscrete,
  }
}

export const useInvitationTableSearchState = () => {
  const [state, setState] = useQueryStates(invitationTableSearchParsers, {
    history: "replace",
    shallow: true,
    urlKeys: invitationTableSearchUrlKeys,
  })
  const setSearch = useCallback(
    (q: string) => setState({ q, page: 1 }, { history: "replace" }),
    [setState]
  )
  const setDiscrete = useCallback(
    (patch: Partial<InvitationTableSearchState>) =>
      setState(patch, { history: "push" }),
    [setState]
  )

  return {
    state,
    setSearch,
    setDiscrete,
  }
}

export const useTableSearchDraft = (
  query: string,
  updateQuery: (query: string) => Promise<URLSearchParams>
) => {
  const [draft, setDraft] = useState(query)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraft(query)
  }, [query])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const updateDraft = useCallback(
    (value: string) => {
      setDraft(value)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void updateQuery(value)
      }, 250)
    },
    [updateQuery]
  )
  const clearDraft = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setDraft("")
    void updateQuery("")
  }, [updateQuery])

  return { clearDraft, draft, updateDraft }
}
