"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import type { Table as ReactTable } from "@tanstack/react-table"
import { usePathname } from "next/navigation"
import { useCallback, type MouseEvent } from "react"

import { LinkButton } from "@/components/link-button/link-button"
import { useIsHydrated } from "@/hooks/use-is-hydrated"

import {
  serializeIssueSearchParams,
  type IssueSearchState,
} from "../../search-params"
import type { IssueUiItem } from "../types/types"

export const issuesTablePagination = ({
  table,
  searchState,
  total,
}: {
  table: ReactTable<IssueUiItem>
  searchState: IssueSearchState
  total: number
}) => {
  const pathname = usePathname()
  const isHydrated = useIsHydrated()
  const previousPageHref = serializeIssueSearchParams(pathname, {
    ...searchState,
    page: Math.max(searchState.page - 1, 1),
  })
  const nextPageHref = serializeIssueSearchParams(pathname, {
    ...searchState,
    page: searchState.page + 1,
  })
  const showPreviousPage = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        !isHydrated ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      table.previousPage()
    },
    [isHydrated, table]
  )
  const showNextPage = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        !isHydrated ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      table.nextPage()
    },
    [isHydrated, table]
  )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-sm text-muted-foreground">{total} issues</p>
      <div className="flex items-center gap-2">
        {table.getCanPreviousPage() ? (
          <LinkButton
            variant="outline"
            size="sm"
            href={previousPageHref}
            prefetch={false}
            onClick={showPreviousPage}
          >
            Previous
          </LinkButton>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {table.getState().pagination.pageIndex + 1} /{" "}
          {Math.max(table.getPageCount(), 1)}
        </span>
        {table.getCanNextPage() ? (
          <LinkButton
            variant="outline"
            size="sm"
            href={nextPageHref}
            prefetch={false}
            onClick={showNextPage}
          >
            Next
          </LinkButton>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
