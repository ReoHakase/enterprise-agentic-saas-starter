"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import type { RowData, Table } from "@tanstack/react-table"
import { useCallback } from "react"

import { DataTableFooter } from "./data-table"
import { getPaginationWindow } from "./data-table-state"

const pageSizes = [20, 50, 100] as const

export const DataTablePagination = <TData extends RowData>({
  table,
  label,
}: {
  table: Table<TData>
  label: string
}) => {
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = Math.max(table.getPageCount(), 1)
  const pages = getPaginationWindow(pageIndex, pageCount)
  const changePageSize = useCallback(
    (value: string | null) => {
      const pageSize = Number(value)
      if (pageSize === 20 || pageSize === 50 || pageSize === 100) {
        table.setPagination({ pageIndex: 0, pageSize })
      }
    },
    [table]
  )

  return (
    <DataTableFooter aria-label={`${label} table footer`}>
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
        <Select
          value={String(table.getState().pagination.pageSize)}
          onValueChange={changePageSize}
        >
          <SelectTrigger className="w-28" aria-label={`${label} per page`}>
            {table.getState().pagination.pageSize} / page
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((pageSize) => (
              <SelectItem key={pageSize} value={String(pageSize)}>
                {pageSize} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <nav className="flex items-center gap-1" aria-label={`${label} pages`}>
          <PaginationButton
            table={table}
            label="First"
            targetPage={0}
            disabled={!table.getCanPreviousPage()}
            className="hidden sm:inline-flex"
          />
          <PaginationButton
            table={table}
            label="Previous"
            targetPage={Math.max(pageIndex - 1, 0)}
            disabled={!table.getCanPreviousPage()}
          />
          <div className="hidden items-center gap-1 sm:flex">
            {pages.map((page) => (
              <PaginationButton
                key={page}
                table={table}
                label={String(page + 1)}
                targetPage={page}
                active={page === pageIndex}
              />
            ))}
          </div>
          <span className="px-2 text-sm sm:hidden">
            {pageIndex + 1} / {pageCount}
          </span>
          <PaginationButton
            table={table}
            label="Next"
            targetPage={Math.min(pageIndex + 1, pageCount - 1)}
            disabled={!table.getCanNextPage()}
          />
          <PaginationButton
            table={table}
            label="Last"
            targetPage={pageCount - 1}
            disabled={!table.getCanNextPage()}
            className="hidden sm:inline-flex"
          />
        </nav>
      </div>
    </DataTableFooter>
  )
}

const PaginationButton = <TData extends RowData>({
  table,
  label,
  targetPage,
  disabled,
  active,
  className,
}: {
  table: Table<TData>
  label: string
  targetPage: number
  disabled?: boolean
  active?: boolean
  className?: string
}) => {
  const goToPage = useCallback(
    () => table.setPageIndex(targetPage),
    [table, targetPage]
  )

  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      disabled={disabled}
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={goToPage}
    >
      {label}
    </Button>
  )
}
