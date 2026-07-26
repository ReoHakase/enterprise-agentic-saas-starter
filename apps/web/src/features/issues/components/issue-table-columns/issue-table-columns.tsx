"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { FileIcon, MessageCircleIcon } from "lucide-react"
import { useMemo } from "react"

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

export const useIssueColumns = ({
  assignees,
  getIssueHref,
  onToggle,
  onUpdate,
  onSelect,
  onRequestDelete,
  organizationId,
}: {
  organizationId: string
  assignees: IssueAssigneeOption[]
  getIssueHref: (issue: IssueUiItem) => string
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  onSelect: (issue: IssueUiItem) => void
  onRequestDelete: (issue: IssueUiItem) => void
}) =>
  useMemo<ColumnDef<IssueUiItem>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => (
          <SortableIssueHeader
            column={column}
            label="#"
            accessibleLabel="Number"
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">
            #{row.original.number}
          </span>
        ),
      },
      {
        id: "thumbnail",
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
          <IssueStatusSelect issue={row.original} onUpdate={onUpdate} />
        ),
        filterFn: "equalsString",
      },
      {
        id: "priority",
        accessorFn: (issue) => issue.priority,
        header: "Priority",
        cell: ({ row }) => (
          <IssuePrioritySelect issue={row.original} onUpdate={onUpdate} />
        ),
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
          />
        ),
      },
      {
        id: "dueDate",
        accessorFn: (issue) => issue.dueDate,
        header: "Due date and time",
        cell: ({ row }) => (
          <IssueDueDateInput issue={row.original} onUpdate={onUpdate} />
        ),
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
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <IssueActionsCell
            issue={row.original}
            onSelect={onSelect}
            onToggle={onToggle}
            onRequestDelete={onRequestDelete}
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
    ]
  )
