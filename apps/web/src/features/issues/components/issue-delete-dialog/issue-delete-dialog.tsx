"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Trash2Icon } from "lucide-react"

import type { IssueUiItem } from "../types"

export const issueDeleteDialog = ({
  target,
  onOpenChange,
  onConfirm,
}: {
  target?: IssueUiItem
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) => (
  <AlertDialog open={target !== undefined} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this issue?</AlertDialogTitle>
        <AlertDialogDescription>
          “{target?.title}” will be permanently removed from this organization.
          This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          Delete issue
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
