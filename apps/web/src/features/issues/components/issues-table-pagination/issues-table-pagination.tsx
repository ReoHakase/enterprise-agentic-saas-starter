"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import type { Table as ReactTable } from "@tanstack/react-table"
import { usePathname } from "next/navigation"
import type { MouseEvent } from "react"

import { DataTableFooter } from "@/components/data-table/data-table"
import { getPaginationWindow } from "@/components/data-table/data-table-state"
import { LinkButton } from "@/components/link-button/link-button"
import { useIsHydrated } from "@/hooks/use-is-hydrated"

import {
  serializeIssueSearchParams,
  type IssueSearchState,
} from "../../search-params"
import { RowsPerPage } from "../issues-table-toolbar/issues-table-toolbar"
import type { IssueUiItem } from "../types"

export const IssuesTablePagination = ({
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
  const pageCount = Math.max(table.getPageCount(), 1)
  const pageIndex = table.getState().pagination.pageIndex
  const pages = getPaginationWindow(pageIndex, pageCount)
  const first = total === 0 ? 0 : pageIndex * Number(searchState.pageSize) + 1
  const last = Math.min((pageIndex + 1) * Number(searchState.pageSize), total)
  const navigateTo =
    (targetPage: number) => (event: MouseEvent<HTMLAnchorElement>) => {
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
      table.setPageIndex(targetPage)
    }
  const hrefFor = (targetPage: number) =>
    serializeIssueSearchParams(pathname, {
      ...searchState,
      page: targetPage + 1,
    })

  return (
    <DataTableFooter aria-label="Issue table footer">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          Showing {first}–{last} of {total} matching issues
        </span>
      </div>
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
        <RowsPerPage table={table} value={searchState.pageSize} />
        <nav className="flex items-center gap-1" aria-label="Issue pages">
          <PageLink
            label="First"
            targetPage={0}
            disabled={!table.getCanPreviousPage()}
            href={hrefFor(0)}
            onClick={navigateTo(0)}
            className="hidden sm:inline-flex"
          />
          <PageLink
            label="Previous"
            targetPage={Math.max(pageIndex - 1, 0)}
            disabled={!table.getCanPreviousPage()}
            href={hrefFor(Math.max(pageIndex - 1, 0))}
            onClick={navigateTo(Math.max(pageIndex - 1, 0))}
          />
          <div className="hidden items-center gap-1 sm:flex">
            {pages.map((page) => (
              <PageLink
                key={page}
                label={String(page + 1)}
                targetPage={page}
                active={page === pageIndex}
                href={hrefFor(page)}
                onClick={navigateTo(page)}
              />
            ))}
          </div>
          <span className="px-2 text-sm sm:hidden">
            {pageIndex + 1} / {pageCount}
          </span>
          <PageLink
            label="Next"
            targetPage={Math.min(pageIndex + 1, pageCount - 1)}
            disabled={!table.getCanNextPage()}
            href={hrefFor(Math.min(pageIndex + 1, pageCount - 1))}
            onClick={navigateTo(Math.min(pageIndex + 1, pageCount - 1))}
          />
          <PageLink
            label="Last"
            targetPage={pageCount - 1}
            disabled={!table.getCanNextPage()}
            href={hrefFor(pageCount - 1)}
            onClick={navigateTo(pageCount - 1)}
            className="hidden sm:inline-flex"
          />
        </nav>
      </div>
    </DataTableFooter>
  )
}

const PageLink = ({
  label,
  href,
  disabled,
  active,
  onClick,
  className,
}: {
  label: string
  targetPage: number
  href: string
  disabled?: boolean
  active?: boolean
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void
  className?: string
}) =>
  disabled ? (
    <Button variant="outline" size="sm" disabled className={className}>
      {label}
    </Button>
  ) : (
    <LinkButton
      variant={active ? "default" : "outline"}
      size="sm"
      href={href}
      prefetch={false}
      onClick={onClick}
      className={className}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </LinkButton>
  )
