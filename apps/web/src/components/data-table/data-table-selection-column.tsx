"use client"

import { Checkbox } from "@enterprise-agentic-saas/ui/components/checkbox"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type {
  CellContext,
  ColumnDef,
  HeaderContext,
} from "@tanstack/react-table"
import { useCallback } from "react"

const SelectionHeader = <TData,>({ table }: HeaderContext<TData, unknown>) => {
  const handleCheckedChange = useCallback(
    (checked: boolean) => table.toggleAllPageRowsSelected(checked),
    [table]
  )
  return (
    <span
      data-slot="data-table-selection-island"
      className="-m-1 inline-flex rounded-[calc(var(--radius-md)+0.25rem)] bg-background/90 p-1 backdrop-blur-sm"
    >
      <span className="inline-flex rounded-md bg-transparent p-1.5 ring-1 ring-border">
        <Checkbox
          disabled={!table.getRowModel().rows.some((row) => row.getCanSelect())}
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          aria-label="Select all rows on this page"
          onCheckedChange={handleCheckedChange}
        />
      </span>
    </span>
  )
}

const SelectionCell = <TData,>({
  row,
  getRowLabel,
}: CellContext<TData, unknown> & {
  getRowLabel: (row: TData) => string
}) => {
  const handleCheckedChange = useCallback(
    (checked: boolean) => row.toggleSelected(checked),
    [row]
  )
  const selected = row.getIsSelected()
  return (
    <span
      data-slot="data-table-selection-island"
      className={cn(
        "-m-1 inline-flex rounded-[calc(var(--radius-md)+0.25rem)] p-1",
        selected
          ? "bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))]/90 backdrop-blur-sm"
          : "bg-background/90 backdrop-blur-sm"
      )}
    >
      <span className="inline-flex rounded-md bg-transparent p-1.5 ring-1 ring-border">
        <Checkbox
          disabled={!row.getCanSelect()}
          checked={row.getIsSelected()}
          aria-label={`Select ${getRowLabel(row.original)}`}
          onCheckedChange={handleCheckedChange}
        />
      </span>
    </span>
  )
}

export const createDataTableSelectionColumn = <TData,>({
  getRowLabel,
}: {
  getRowLabel: (row: TData) => string
}): ColumnDef<TData> => ({
  id: "select",
  header: SelectionHeader,
  cell: (context) => <SelectionCell {...context} getRowLabel={getRowLabel} />,
  enableHiding: false,
  enableSorting: false,
  size: 44,
  meta: {
    headerClassName: "w-11 px-3",
    cellClassName: "w-11 px-3",
  },
})
