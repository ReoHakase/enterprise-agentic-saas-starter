"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"

import {
  IssueActionsCell,
  IssueAssigneeSelect,
  IssueDueDateInput,
  IssuePrioritySelect,
  IssueStatusSelect,
  IssueTitleCell,
  SortableIssueHeader,
} from "./issue-inline-controls"
import { formatIssueDate, getIssueStatus } from "./issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "./types"

export const useIssueColumns = ({
  assignees,
  busyIssueId,
  onToggle,
  onUpdate,
  onSelect,
  onRequestDelete,
}: {
  assignees: IssueAssigneeOption[]
  busyIssueId?: string
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  onSelect: (issue: IssueUiItem) => void
  onRequestDelete: (issue: IssueUiItem) => void
}) =>
  useMemo<ColumnDef<IssueUiItem>[]>(
    () => [
      {
        id: "status",
        accessorFn: getIssueStatus,
        header: "Status",
        cell: ({ row }) => (
          <IssueStatusSelect
            issue={row.original}
            disabled={busyIssueId === row.original.id || !onUpdate}
            onUpdate={onUpdate}
          />
        ),
        filterFn: "equalsString",
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <SortableIssueHeader column={column} label="Issue" />
        ),
        cell: ({ row }) => (
          <IssueTitleCell issue={row.original} onSelect={onSelect} />
        ),
      },
      {
        id: "priority",
        accessorFn: (issue) => issue.priority,
        header: "Priority",
        cell: ({ row }) => (
          <IssuePrioritySelect
            issue={row.original}
            disabled={busyIssueId === row.original.id || !onUpdate}
            onUpdate={onUpdate}
          />
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
            disabled={busyIssueId === row.original.id || !onUpdate}
            onUpdate={onUpdate}
          />
        ),
      },
      {
        id: "dueDate",
        accessorFn: (issue) => issue.dueDate,
        header: "Due date",
        cell: ({ row }) => (
          <IssueDueDateInput
            issue={row.original}
            disabled={busyIssueId === row.original.id || !onUpdate}
            onUpdate={onUpdate}
          />
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
        cell: ({ row }) => formatIssueDate(row.original.updatedAt),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <IssueActionsCell
            issue={row.original}
            busy={busyIssueId === row.original.id}
            onSelect={onSelect}
            onToggle={onToggle}
            onRequestDelete={onRequestDelete}
          />
        ),
      },
    ],
    [assignees, busyIssueId, onRequestDelete, onSelect, onToggle, onUpdate]
  )
