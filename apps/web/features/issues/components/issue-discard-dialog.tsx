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
import { Trash2Icon, Undo2Icon } from "lucide-react"

import type { IssueDetailNavigationState } from "./use-issue-detail-navigation"

export const issueDiscardDialog = ({
  navigation,
}: {
  navigation: IssueDetailNavigationState
}) => (
  <AlertDialog
    open={navigation.discardOpen}
    onOpenChange={navigation.handleDiscardOpenChange}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
        <AlertDialogDescription>
          Your title, description, or comment draft will be lost.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={navigation.cancelDiscard}>
          <Undo2Icon data-icon="inline-start" aria-hidden="true" />
          Keep editing
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={navigation.confirmDiscard}
        >
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          Discard changes
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
