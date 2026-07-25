"use client"

import { useCallback, useState } from "react"

import type { IssueUpdateField } from "../issue-update-state"
import type {
  ImmediateField,
  IssueDetailDialogProps,
} from "./issue-detail-types"
import type { IssueUiItem, IssueUpdate } from "./types"

export const useIssueImmediateFields = ({
  issue,
  pendingFields,
  onUpdate,
}: {
  issue: IssueUiItem
  pendingFields: ReadonlySet<IssueUpdateField>
  onUpdate: IssueDetailDialogProps["onUpdate"]
}) => {
  const [savingFields, setSavingFields] = useState<Set<ImmediateField>>(
    () => new Set()
  )
  const updateField = useCallback(
    async (field: ImmediateField, update: IssueUpdate) => {
      if (!onUpdate) return
      setSavingFields((current) => new Set(current).add(field))
      try {
        await onUpdate(issue, update)
      } catch {
        // The controller owns the user-facing toast. Settle fire-and-forget
        // changes here so rejected mutations do not leak to the browser.
      } finally {
        setSavingFields((current) => {
          const next = new Set(current)
          next.delete(field)
          return next
        })
      }
    },
    [issue, onUpdate]
  )
  const changeStatus = useCallback(
    (status: IssueUiItem["status"] | "all") => {
      if (status !== "all") void updateField("status", { status })
    },
    [updateField]
  )
  const changePriority = useCallback(
    (priority: IssueUiItem["priority"] | "all") => {
      if (priority !== "all") void updateField("priority", { priority })
    },
    [updateField]
  )
  const changeAssignee = useCallback(
    (assigneeId: string | null) =>
      void updateField("assigneeId", { assigneeId }),
    [updateField]
  )
  const changeLabels = useCallback(
    (labels: string[]) => void updateField("labels", { labels }),
    [updateField]
  )
  const changeDueDate = useCallback(
    (dueDate: string | null) => void updateField("dueDate", { dueDate }),
    [updateField]
  )
  const isFieldSaving = useCallback(
    (field: ImmediateField) =>
      savingFields.has(field) || pendingFields.has(field),
    [pendingFields, savingFields]
  )

  return {
    changeAssignee,
    changeDueDate,
    changeLabels,
    changePriority,
    changeStatus,
    isFieldSaving,
    saving: savingFields.size > 0,
  }
}

export type IssueImmediateFieldsState = ReturnType<
  typeof useIssueImmediateFields
>
