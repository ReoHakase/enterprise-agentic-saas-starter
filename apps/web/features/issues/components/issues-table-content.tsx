import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import { flexRender, type Table as ReactTable } from "@tanstack/react-table"
import { CircleDotIcon, RefreshCwIcon } from "lucide-react"

import { IssueMutationContext } from "./issue-table-state"
import { issueColumnClassName } from "./issues-table-utils"
import type { IssueUiItem } from "./types"

const IssuesLoadError = ({
  error,
  onRetry,
}: {
  error: string
  onRetry?: () => void
}) => (
  <Empty className="border" role="alert">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <RefreshCwIcon aria-hidden="true" />
      </EmptyMedia>
      <EmptyTitle>Issues could not be loaded</EmptyTitle>
      <EmptyDescription>{error}</EmptyDescription>
    </EmptyHeader>
    {onRetry ? (
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </EmptyContent>
    ) : null}
  </Empty>
)

const EmptyIssuesRow = ({ columnCount }: { columnCount: number }) => (
  <TableRow>
    <TableCell colSpan={columnCount}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleDotIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No matching issues</EmptyTitle>
          <EmptyDescription>
            Adjust the search or create the first issue for this organization.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </TableCell>
  </TableRow>
)

const IssueRows = ({ table }: { table: ReactTable<IssueUiItem> }) => {
  const rows = table.getRowModel().rows
  if (rows.length === 0) {
    return <EmptyIssuesRow columnCount={table.getAllColumns().length} />
  }

  return rows.map((row) => (
    <TableRow
      key={row.id}
      className="group/issue-row"
      data-state={row.getIsSelected() ? "selected" : undefined}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={issueColumnClassName(cell.column.id)}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  ))
}

const IssuesDataTable = ({
  table,
  busyIssueId,
}: {
  table: ReactTable<IssueUiItem>
  busyIssueId?: string
}) => (
  <div className="overflow-hidden rounded-xl border">
    <IssueMutationContext.Provider value={busyIssueId}>
      <Table scrollLabel="Organization issues">
        <TableCaption className="sr-only">
          Issues for the active organization
        </TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={issueColumnClassName(header.column.id)}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          <IssueRows table={table} />
        </TableBody>
      </Table>
    </IssueMutationContext.Provider>
  </div>
)

export const issuesTableContent = ({
  table,
  busyIssueId,
  error,
  onRetry,
}: {
  table: ReactTable<IssueUiItem>
  busyIssueId?: string
  error?: string
  onRetry?: () => void
}) =>
  error ? (
    <IssuesLoadError error={error} onRetry={onRetry} />
  ) : (
    <IssuesDataTable table={table} busyIssueId={busyIssueId} />
  )
