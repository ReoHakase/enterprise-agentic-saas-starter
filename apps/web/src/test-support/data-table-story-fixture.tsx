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
import { useMemo, useState } from "react"

import {
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
} from "@/components/data-table/data-table"
import { createDataTableSelectionColumn } from "@/components/data-table/data-table-selection-column"

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
const storyActionTrigger = <Button variant="ghost" size="icon-sm" />
const handleStoryAction = () => undefined
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
  if (!interactive) return <Button onClick={handleStoryAction}>Open</Button>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={storyActionTrigger}
        aria-label={`Actions for ${row.name}`}
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleStoryAction}>Edit</DropdownMenuItem>
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

export const DataTableStoryFixture = ({
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
