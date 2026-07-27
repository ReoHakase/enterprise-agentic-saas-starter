"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Table as TablePrimitive,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  flexRender,
  type Column,
  type RowData,
  type Table,
} from "@tanstack/react-table"
import type { ComponentProps, ReactNode } from "react"

import { getDataTableColumnMeta } from "./data-table-column-meta"

const pinnedColumnStyle = <TData extends RowData>(
  column: Column<TData, unknown>
) => {
  const pinned = column.getIsPinned()
  if (!pinned) return undefined
  return pinned === "left"
    ? { left: `${column.getStart("left")}px` }
    : { right: `${column.getAfter("right")}px` }
}

const pinnedColumnClassName = <TData extends RowData>(
  column: Column<TData, unknown>
) => {
  const pinned = column.getIsPinned()
  return cn(pinned && "sticky z-10 bg-transparent")
}

export const DataTableRoot = ({
  scrollLabel,
  children,
}: {
  scrollLabel: string
  children: ReactNode
}) => (
  <div className="min-w-0 overflow-hidden rounded-xl border">
    <TablePrimitive scrollLabel={scrollLabel}>{children}</TablePrimitive>
  </div>
)

export const DataTableHeader = <TData extends RowData>({
  table,
}: {
  table: Table<TData>
}) => (
  <TableHeader>
    {table.getHeaderGroups().map((headerGroup) => (
      <TableRow key={headerGroup.id}>
        {headerGroup.headers.map((header) => (
          <TableHead
            key={header.id}
            className={cn(
              getDataTableColumnMeta(header.column.columnDef.meta)
                .headerClassName,
              pinnedColumnClassName(header.column)
            )}
            style={pinnedColumnStyle(header.column)}
          >
            {header.isPlaceholder
              ? null
              : flexRender(header.column.columnDef.header, header.getContext())}
          </TableHead>
        ))}
      </TableRow>
    ))}
  </TableHeader>
)

export const DataTableBody = <TData extends RowData>({
  table,
  children,
}: {
  table: Table<TData>
  children?: ReactNode
}) => {
  const rows = table.getRowModel().rows
  return (
    <TableBody>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell colSpan={table.getVisibleLeafColumns().length}>
            {children}
          </TableCell>
        </TableRow>
      ) : (
        rows.map((row) => (
          <TableRow
            key={row.id}
            className="group/data-table-row data-[state=selected]:bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))] data-[state=selected]:hover:bg-[color-mix(in_oklab,var(--primary)_15%,var(--background))]"
            data-state={row.getIsSelected() ? "selected" : undefined}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={cn(
                  getDataTableColumnMeta(cell.column.columnDef.meta)
                    .cellClassName,
                  pinnedColumnClassName(cell.column)
                )}
                style={pinnedColumnStyle(cell.column)}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))
      )}
    </TableBody>
  )
}

export const DataTableToolbar = ({
  className,
  ...props
}: ComponentProps<"div">) => (
  <div
    className={cn("flex flex-wrap items-center gap-2", className)}
    {...props}
  />
)

export const DataTableToolbarGroup = ({
  className,
  ...props
}: ComponentProps<"div">) => (
  <div
    data-slot="data-table-toolbar-group"
    className={cn(
      "flex min-w-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2",
      className
    )}
    {...props}
  />
)

export const DataTableToolbarRow = ({
  className,
  ...props
}: ComponentProps<"div">) => (
  <div
    data-slot="data-table-toolbar-row"
    className={cn("flex basis-full flex-wrap items-center gap-2", className)}
    {...props}
  />
)

export const DataTableToolbarGroupActions = ({
  className,
  ...props
}: ComponentProps<"div">) => (
  <div
    data-slot="data-table-toolbar-group-actions"
    className={cn("ml-auto flex shrink-0 items-center", className)}
    {...props}
  />
)

export const DataTableToolbarLabel = ({
  className,
  ...props
}: ComponentProps<"span">) => (
  <span
    data-slot="data-table-toolbar-label"
    className={cn(
      "inline-flex items-center gap-1 text-sm font-medium text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  />
)

export const DataTableFooter = ({
  className,
  ...props
}: ComponentProps<"div">) => (
  <div
    className={cn(
      "flex flex-wrap items-center justify-between gap-3 border-t bg-background p-3",
      className
    )}
    {...props}
  />
)

export const DataTableSelectionBar = ({
  selectedCount,
  onClear,
}: {
  selectedCount: number
  onClear: () => void
}) =>
  selectedCount > 0 ? (
    <div
      data-slot="data-table-selection-anchor"
      data-testid="data-table-selection-anchor"
      className="pointer-events-none sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex h-fit justify-center self-end"
    >
      <div
        data-slot="data-table-selection-bar"
        data-testid="data-table-selection-bar"
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground px-2 py-1 text-sm text-background shadow-lg"
      >
        <span
          className="pl-2 whitespace-nowrap"
          role="status"
          aria-live="polite"
          aria-label={`${selectedCount} selected`}
        >
          {selectedCount} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-background hover:bg-background/15 hover:text-background"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </div>
  ) : null
