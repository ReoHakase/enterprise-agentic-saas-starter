import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { TableCaption } from "@enterprise-agentic-saas/ui/components/table"
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback, useMemo, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { DataTableBody, DataTableHeader, DataTableRoot } from "./data-table"
import { createDataTableSelectionColumn } from "./data-table-selection-column"

type Item = { id: string; name: string }

const selectionColumn = createDataTableSelectionColumn<Item>({
  getRowLabel: (item) => item.name,
})

const ItemAction = ({
  item,
  onAction,
}: {
  item: Item
  onAction: (id: string) => void
}) => {
  const handleClick = useCallback(() => onAction(item.id), [item.id, onAction])
  return <Button onClick={handleClick}>Edit {item.name}</Button>
}

const createColumns = (
  selectable: boolean,
  onAction: (id: string) => void
): ColumnDef<Item>[] => [
  ...(selectable ? [selectionColumn] : []),
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <a href={`/items/${row.id}`}>{row.original.name}</a>,
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <ItemAction item={row.original} onAction={onAction} />,
  },
]

const DataTableProbe = ({
  selectable,
  onAction,
}: {
  selectable: boolean
  onAction: (id: string) => void
}) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const columns = useMemo(
    () => createColumns(selectable, onAction),
    [onAction, selectable]
  )
  const table = useReactTable({
    data: [
      { id: "one", name: "One" },
      { id: "two", name: "Two" },
    ],
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <DataTableRoot
      className="rounded-2xl"
      tableClassName="min-w-200"
      scrollLabel="Items"
    >
      <TableCaption className="sr-only">Items</TableCaption>
      <DataTableHeader table={table} />
      <DataTableBody table={table}>No items</DataTableBody>
    </DataTableRoot>
  )
}

describe("DataTable", () => {
  it("keeps arbitrary interactive cells usable without row event cross-talk", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn<(id: string) => void>()
    render(<DataTableProbe selectable onAction={onAction} />)

    const table = screen.getByRole("table", { name: "Items" })
    expect(table).toHaveClass("min-w-200")
    expect(screen.getByTestId("data-table-root")).toHaveClass("rounded-2xl")
    await user.click(screen.getByRole("button", { name: "Edit One" }))
    expect(onAction).toHaveBeenCalledWith("one")
    expect(
      screen.getByRole("checkbox", { name: "Select One" })
    ).not.toBeChecked()
    expect(screen.getByRole("link", { name: "One" })).toHaveAttribute(
      "href",
      "/items/one"
    )
  })

  it("supports selection off, on, and an indeterminate page state", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn<(id: string) => void>()
    const view = render(
      <DataTableProbe selectable={false} onAction={onAction} />
    )
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()

    view.rerender(<DataTableProbe selectable onAction={onAction} />)
    await user.click(screen.getByRole("checkbox", { name: "Select One" }))
    expect(screen.getByRole("checkbox", { name: "Select One" })).toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Select all rows on this page" })
    ).toHaveAttribute("data-indeterminate")
  })
})
