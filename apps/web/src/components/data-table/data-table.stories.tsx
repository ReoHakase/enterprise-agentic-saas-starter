import {
  Avatar,
  AvatarFallback,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { TableCaption } from "@enterprise-agentic-saas/ui/components/table"
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table"
import { MoreHorizontalIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { DataTableBody, DataTableHeader, DataTableRoot } from "./data-table"
import { createDataTableSelectionColumn } from "./data-table-selection-column"

type StoryRow = {
  id: string
  name: string
  owner: string
  status: string
}

const rows: StoryRow[] = [
  { id: "one", name: "Billing webhook", owner: "Avery", status: "Ready" },
  { id: "two", name: "Role permissions", owner: "Jordan", status: "Draft" },
]
const action = fn()
const storyActionTrigger = <Button variant="ghost" size="icon-sm" />
const getStoryRowId = (row: StoryRow) => row.id

const storySelectionColumn = createDataTableSelectionColumn<StoryRow>({
  getRowLabel: (row) => row.name,
})

const StoryAction = ({
  row,
  interactive,
}: {
  row: StoryRow
  interactive: boolean
}) => {
  const handleAction = useCallback(() => action(row.id), [row.id])
  if (!interactive) return <Button onClick={handleAction}>Open</Button>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={storyActionTrigger}
        aria-label={`Actions for ${row.name}`}
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleAction}>Edit</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const createStoryColumns = (
  selectable: boolean,
  interactive: boolean,
  wide: boolean
): ColumnDef<StoryRow>[] => [
  ...(selectable ? [storySelectionColumn] : []),
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <a className="font-medium underline" href={`/issues/${row.id}`}>
        {row.original.name}
      </a>
    ),
    meta: { cellClassName: wide ? "min-w-96" : undefined },
  },
  {
    accessorKey: "owner",
    header: "Owner",
    cell: ({ row }) =>
      interactive ? (
        <span className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback>{row.original.owner.slice(0, 2)}</AvatarFallback>
          </Avatar>
          {row.original.owner}
        </span>
      ) : (
        row.original.owner
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      interactive ? (
        <Select defaultValue={row.original.status}>
          <SelectTrigger aria-label={`Status for ${row.original.name}`}>
            {row.original.status}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Ready">Ready</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        row.original.status
      ),
    meta: { cellClassName: wide ? "min-w-72" : undefined },
  },
  ...(wide
    ? Array.from({ length: 6 }, (_, index) => ({
        id: `detail-${index}`,
        header: `Detail ${index + 1}`,
        cell: ({ row }: { row: { original: StoryRow } }) =>
          `${row.original.name} detail ${index + 1}`,
        meta: { cellClassName: "min-w-64" },
      }))
    : []),
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <StoryAction row={row.original} interactive={interactive} />
    ),
  },
]

const DataTableShowcase = ({
  selectable = false,
  interactive = false,
  wide = false,
}: {
  selectable?: boolean
  interactive?: boolean
  wide?: boolean
}) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const columns = useMemo(
    () => createStoryColumns(selectable, interactive, wide),
    [interactive, selectable, wide]
  )
  const table = useReactTable({
    data: rows,
    columns,
    state: { rowSelection },
    initialState: {
      columnPinning: {
        left: selectable ? ["select"] : [],
        right: wide ? ["actions"] : [],
      },
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getRowId: getStoryRowId,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <DataTableRoot scrollLabel="Example data">
      <TableCaption className="sr-only">Example data</TableCaption>
      <DataTableHeader table={table} />
      <DataTableBody table={table}>No rows</DataTableBody>
    </DataTableRoot>
  )
}

const meta = preview.meta({
  title: "Web/Shared/Data Table",
  component: DataTableShowcase,
  tags: ["autodocs"],
})

export const Default = meta.story({})

export const InteractiveCells = meta.story({
  args: { interactive: true, selectable: true },
  play: async ({ canvas, canvasElement }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    const checkbox = canvas.getByRole("checkbox", {
      name: "Select Billing webhook",
    })
    const link = canvas.getByRole("link", { name: "Billing webhook" })
    link.focus()
    await userEvent.keyboard("{Tab}{Enter}")
    const select = canvas.getByRole("combobox", {
      name: "Status for Billing webhook",
    })
    await expect(
      await ownerBody.findByRole("option", { name: "Ready" })
    ).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(select).toHaveFocus())
    await userEvent.keyboard("{Tab}{Enter}")
    const actions = canvas.getByRole("button", {
      name: "Actions for Billing webhook",
    })
    const menu = await ownerBody.findByRole("menu")
    await waitFor(() => expect(menu).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(actions).toHaveFocus())
    await expect(checkbox).not.toBeChecked()
  },
})

export const Selectable = meta.story({
  args: { selectable: true },
  play: async ({ canvas }) => {
    const first = canvas.getByRole("checkbox", {
      name: "Select Billing webhook",
    })
    await userEvent.click(first)
    await expect(first).toBeChecked()
    await expect(
      canvas.getByRole("checkbox", { name: "Select all rows on this page" })
    ).toHaveAttribute("data-indeterminate")
  },
})

export const HorizontalOverflow = meta.story({
  args: { wide: true, interactive: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Detail 6")).toBeVisible()
  },
})

export const Mobile = meta.story({
  args: { selectable: true, interactive: true, wide: true },
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  play: async ({ canvas, canvasElement }) => {
    const table = canvas.getByRole("table")
    const container = table.closest<HTMLElement>(
      '[data-slot="table-container"]'
    )
    if (!container) throw new Error("Expected the table scroll container")
    await waitFor(() =>
      expect(container.scrollWidth).toBeGreaterThan(container.clientWidth)
    )
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
    const selection = canvas.getByRole("checkbox", {
      name: "Select Billing webhook",
    })
    const actionButton = canvas.getByRole("button", {
      name: "Actions for Billing webhook",
    })
    const leftBefore = selection.getBoundingClientRect().left
    const rightBefore = actionButton.getBoundingClientRect().right
    container.scrollLeft = container.scrollWidth
    await waitFor(() => expect(container.scrollLeft).toBeGreaterThan(0))
    expect(selection.getBoundingClientRect().left).toBeCloseTo(leftBefore, 0)
    expect(actionButton.getBoundingClientRect().right).toBeCloseTo(
      rightBefore,
      0
    )
  },
})
