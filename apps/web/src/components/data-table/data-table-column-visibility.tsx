"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@enterprise-agentic-saas/ui/components/tooltip"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { RowData, Table } from "@tanstack/react-table"
import { EyeClosedIcon, EyeIcon, RotateCcwIcon } from "lucide-react"
import { useCallback, useMemo } from "react"

import { getDataTableColumnMeta } from "./data-table-column-meta"

const columnVisibilityTrigger = <Button variant="outline" size="sm" />
const headerColumnVisibilityTrigger = <Button variant="ghost" size="icon-sm" />

export const DataTableColumnVisibility = <TData extends RowData>({
  table,
  onReset,
  triggerVariant = "toolbar",
}: {
  table: Table<TData>
  onReset: () => void
  triggerVariant?: "toolbar" | "header"
}) => {
  const columns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())
  const customized = columns.some((column) => !column.getIsVisible())
  const trigger = useMemo(
    () => (
      <DropdownMenuTrigger
        render={
          triggerVariant === "header"
            ? headerColumnVisibilityTrigger
            : columnVisibilityTrigger
        }
        aria-label="Choose visible columns"
        data-state={customized ? "active" : "default"}
        className={cn(
          customized && "text-primary",
          triggerVariant === "toolbar" && customized && "border-primary",
          triggerVariant === "header" &&
            "rounded-md bg-transparent p-2 ring-1 ring-border",
          triggerVariant === "header" &&
            customized &&
            "text-primary ring-primary"
        )}
      >
        <EyeIcon data-icon="eye" aria-hidden="true" />
        {triggerVariant === "toolbar" ? "Columns" : null}
      </DropdownMenuTrigger>
    ),
    [customized, triggerVariant]
  )
  return (
    <DropdownMenu>
      {triggerVariant === "header" ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent>Choose visible columns</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="end">
        {columns.map((column) => (
          <ColumnVisibilityItem key={column.id} column={column} />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onReset}>
          <RotateCcwIcon aria-hidden="true" />
          Reset columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const ColumnVisibilityItem = <TData extends RowData>({
  column,
}: {
  column: ReturnType<Table<TData>["getAllLeafColumns"]>[number]
}) => {
  const handleCheckedChange = useCallback(
    (checked: boolean) => column.toggleVisibility(checked),
    [column]
  )
  return (
    <DropdownMenuCheckboxItem
      checked={column.getIsVisible()}
      data-visibility-icon={column.getIsVisible() ? "eye" : "eye-closed"}
      onCheckedChange={handleCheckedChange}
    >
      {column.getIsVisible() ? (
        <EyeIcon aria-hidden="true" />
      ) : (
        <EyeClosedIcon aria-hidden="true" />
      )}
      {getDataTableColumnMeta(column.columnDef.meta).label ?? column.id}
    </DropdownMenuCheckboxItem>
  )
}
