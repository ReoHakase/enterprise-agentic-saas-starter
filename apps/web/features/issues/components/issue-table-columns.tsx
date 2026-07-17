"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"

import { LocalDate } from "@/components/local-date"

import {
  IssueActionsCell,
  IssueAssigneeSelect,
  IssueDueDateInput,
  IssuePrioritySelect,
  IssueStatusSelect,
  IssueTitleCell,
  SortableIssueHeader,
} from "./issue-inline-controls"
import { getIssueStatus } from "./issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "./types"

export const useIssueColumns = ({
  assignees,
  getIssueHref,
  onToggle,
  onUpdate,
  onSelect,
  onRequestDelete,
}: {
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
          <SortableIssueHeader column={column} label="Number" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">
            #{row.original.number}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <SortableIssueHeader column={column} label="Name" />
        ),
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
    [assignees, getIssueHref, onRequestDelete, onSelect, onToggle, onUpdate]
  )
