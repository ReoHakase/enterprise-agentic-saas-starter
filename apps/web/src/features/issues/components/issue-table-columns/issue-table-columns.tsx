"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { FileIcon, MessageCircleIcon } from "lucide-react"
import { useMemo } from "react"

import { DataTableColumnVisibility } from "@/components/data-table/data-table-column-visibility"
import { createDataTableSelectionColumn } from "@/components/data-table/data-table-selection-column"
import { LocalDate } from "@/components/local-date/local-date"
import { AuthenticatedFileImage } from "@/features/files"

import {
  IssueActionsCell,
  IssueAssigneeSelect,
  IssueDueDateInput,
  IssuePrioritySelect,
  IssueStatusSelect,
  IssueTitleCell,
  SortableIssueHeader,
} from "../issue-inline-controls/issue-inline-controls"
import { getIssueStatus } from "../issue-utils/issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "../types/types"

const issueSelectionColumn = createDataTableSelectionColumn<IssueUiItem>({
  getRowLabel: (issue) => `issue ${issue.number}`,
})

export const useIssueColumns = ({
  assignees,
  getIssueHref,
  onToggle,
  onUpdate,
  onSelect,
  onRequestDelete,
  organizationId,
  enableRowSelection,
  disabled,
  resetColumnVisibility,
}: {
  organizationId: string
  assignees: IssueAssigneeOption[]
  getIssueHref: (issue: IssueUiItem) => string
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  onSelect: (issue: IssueUiItem) => void
  onRequestDelete: (issue: IssueUiItem) => void
  enableRowSelection: boolean
  disabled: boolean
  resetColumnVisibility: () => void
}) =>
  useMemo<ColumnDef<IssueUiItem>[]>(
    () => [
      ...(enableRowSelection ? [issueSelectionColumn] : []),
      {
        accessorKey: "number",
        meta: {
          label: "Number",
          headerClassName: "w-14 max-w-14 px-2",
          cellClassName: "w-14 max-w-14 px-2",
        },
        header: ({ column }) => (
          <SortableIssueHeader
            column={column}
            label="#"
            accessibleLabel="Number"
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-foreground/80">
            #{row.original.number}
          </span>
        ),
      },
      {
        id: "thumbnail",
        meta: {
          label: "Thumbnail",
          headerClassName: "w-20 min-w-20 px-2",
          cellClassName: "w-20 min-w-20 px-2",
        },
        header: () => <span className="sr-only">Thumbnail</span>,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.thumbnail ? (
            <AuthenticatedFileImage
              file={row.original.thumbnail}
              organizationId={organizationId}
              sizes="64px"
              className="size-16 max-w-none rounded-md border bg-muted object-cover"
              loading="lazy"
            />
          ) : (
            <span className="block size-16 rounded-md border border-dashed bg-muted/30">
              <span className="sr-only">No thumbnail</span>
            </span>
          ),
      },
      {
        accessorKey: "title",
        enableHiding: false,
        meta: { label: "Name", cellClassName: "min-w-64" },
        header: "Name",
        enableSorting: false,
        cell: ({ row }) => (
          <IssueTitleCell
            issue={row.original}
            href={getIssueHref(row.original)}
          />
        ),
      },
      {
        id: "status",
        accessorFn: getIssueStatus,
        header: "Status",
        cell: ({ row }) => (
          <IssueStatusSelect
            issue={row.original}
            onUpdate={onUpdate}
            disabled={disabled}
          />
        ),
        filterFn: "equalsString",
        meta: { label: "Status" },
      },
      {
        id: "priority",
        accessorFn: (issue) => issue.priority,
        header: "Priority",
        cell: ({ row }) => (
          <IssuePrioritySelect
            issue={row.original}
            onUpdate={onUpdate}
            disabled={disabled}
          />
        ),
        meta: { label: "Priority" },
      },
      {
        id: "assignee",
        accessorFn: (issue) => issue.assigneeId,
        header: "Assignee",
        cell: ({ row }) => (
          <IssueAssigneeSelect
            issue={row.original}
            assignees={assignees}
            onUpdate={onUpdate}
            disabled={disabled}
          />
        ),
        meta: { label: "Assignee" },
      },
      {
        id: "dueDate",
        accessorFn: (issue) => issue.dueDate,
        header: "Due date and time",
        cell: ({ row }) => (
          <IssueDueDateInput
            issue={row.original}
            onUpdate={onUpdate}
            disabled={disabled}
          />
        ),
        meta: { label: "Due date" },
      },
      {
        id: "comments",
        accessorFn: (issue) => issue.commentCount ?? 0,
        header: "Comments",
        enableSorting: false,
        cell: ({ row }) =>
          (row.original.commentCount ?? 0) > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-muted-foreground tabular-nums"
              aria-label={`${row.original.commentCount} comments`}
            >
              <MessageCircleIcon className="size-4" aria-hidden="true" />
              {row.original.commentCount}
            </span>
          ) : null,
        meta: {
          label: "Comments",
          headerClassName: "w-20 min-w-20 text-center",
          cellClassName: "w-20 min-w-20 text-center",
        },
      },
      {
        id: "files",
        accessorFn: (issue) => issue.attachmentCount ?? 0,
        header: "Files",
        enableSorting: false,
        cell: ({ row }) =>
          (row.original.attachmentCount ?? 0) > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-muted-foreground tabular-nums"
              aria-label={`${row.original.attachmentCount} files`}
            >
              <FileIcon className="size-4" aria-hidden="true" />
              {row.original.attachmentCount}
            </span>
          ) : null,
        meta: {
          label: "Files",
          headerClassName: "w-20 min-w-20 text-center",
          cellClassName: "w-20 min-w-20 text-center",
        },
      },
      {
        id: "updatedAt",
        accessorFn: (issue) => issue.updatedAt,
        header: ({ column }) => (
          <SortableIssueHeader
            column={column}
            label="Updated"
            showDescendingIcon
          />
        ),
        cell: ({ row }) => (
          <LocalDate value={row.original.updatedAt} includeTime />
        ),
        meta: { label: "Updated" },
      },
      {
        id: "actions",
        header: ({ table }) => (
          <span
            data-slot="issue-actions-header-island"
            data-testid="issue-actions-header-island"
            className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-[calc(var(--radius-md)+0.25rem)] bg-background/90 p-1 backdrop-blur-sm"
          >
            <span className="sr-only">Actions</span>
            <DataTableColumnVisibility
              table={table}
              onReset={resetColumnVisibility}
              triggerVariant="header"
            />
          </span>
        ),
        enableHiding: false,
        meta: {
          label: "Actions",
          headerClassName:
            "relative w-12 min-w-12 max-w-12 overflow-visible p-0",
          cellClassName: "w-12 min-w-12 max-w-12 p-0",
        },
        cell: ({ row }) => (
          <IssueActionsCell
            issue={row.original}
            selected={row.getIsSelected()}
            onSelect={onSelect}
            onToggle={onToggle}
            onRequestDelete={onRequestDelete}
            disabled={disabled}
          />
        ),
      },
    ],
    [
      assignees,
      getIssueHref,
      onRequestDelete,
      onSelect,
      onToggle,
      onUpdate,
      organizationId,
      enableRowSelection,
      disabled,
      resetColumnVisibility,
    ]
  )
