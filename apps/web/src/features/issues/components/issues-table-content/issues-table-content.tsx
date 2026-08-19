import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { TableCaption } from "@enterprise-agentic-saas/ui/components/table"
import type { Table as ReactTable } from "@tanstack/react-table"
import { CircleDotIcon, RefreshCwIcon } from "lucide-react"

import {
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
} from "@/components/data-table/data-table"

import { IssueMutationContext } from "../issue-table-state/issue-table-state"
import type { IssueUiItem } from "../types"

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

const EmptyIssues = () => (
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
)
const emptyIssues = <EmptyIssues />

const IssuesDataTable = ({
  table,
  busyIssueId,
  fetching,
}: {
  table: ReactTable<IssueUiItem>
  busyIssueId?: string
  fetching?: boolean
}) => (
  <div
    className="relative"
    aria-label="Issue table"
    aria-busy={fetching || undefined}
  >
    {fetching ? (
      <Spinner
        className="absolute top-3 right-3 z-30 size-5 rounded-full bg-background p-0.5 text-primary shadow-sm"
        aria-label="Updating issues"
      />
    ) : null}
    <IssueMutationContext.Provider value={busyIssueId}>
      <DataTableRoot scrollLabel="Organization issues">
        <TableCaption className="sr-only">
          Issues for the active organization
        </TableCaption>
        <DataTableHeader table={table} />
        <DataTableBody table={table}>{emptyIssues}</DataTableBody>
      </DataTableRoot>
    </IssueMutationContext.Provider>
  </div>
)

export const issuesTableContent = ({
  table,
  busyIssueId,
  fetching,
  error,
  onRetry,
}: {
  table: ReactTable<IssueUiItem>
  busyIssueId?: string
  fetching?: boolean
  error?: string
  onRetry?: () => void
}) =>
  error ? (
    <IssuesLoadError error={error} onRetry={onRetry} />
  ) : (
    <IssuesDataTable
      table={table}
      busyIssueId={busyIssueId}
      fetching={fetching}
    />
  )
