import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { MessageSquarePlusIcon } from "lucide-react"

import type { AgentThread } from "../../schema"
import type { AgentComposerSnapshot } from "../agent-composer/agent-composer"
import { AgentConversation } from "../agent-conversation/agent-conversation"
import {
  AgentNewThreadComposer,
  type AgentNewThreadInput,
} from "../agent-new-thread-composer/agent-new-thread-composer"
import { AgentShortcutHelp } from "../agent-shortcut-help/agent-shortcut-help"
import {
  AgentThreadItem,
  AgentThreadToolbar,
} from "../agent-thread-picker/agent-thread-picker"

export type AgentDashboardViewProps = {
  archiveThread: (threadId: string) => void
  archivingThread: boolean
  autoSubmitThreadId?: string
  cancelThreadTransition: () => void
  completeAutoSubmit: () => void
  completeInitialComposerHandoff: (threadId: string) => void
  confirmThreadTransition: () => void
  createFromDraft: (input: AgentNewThreadInput) => void
  creatingThread: boolean
  disabled: boolean
  handleTransitionOpenChange: (open: boolean) => void
  initialComposerHandoff?: {
    threadId: string
    snapshot: AgentComposerSnapshot
  }
  interactionDisabled: boolean
  organizationId: string
  organizationSlug: string
  pendingTransition?: { kind: "archive" | "switch" }
  presentation: "page" | "shell"
  selectedThread?: AgentThread
  selectThread: (threadId: string) => void
  setShortcutHelpOpen: (open: boolean) => void
  shortcutHelpOpen: boolean
  startThread: () => void
  threads: AgentThread[]
  threadsError: boolean
  threadsLoading: boolean
}

export const renderAgentDashboardView = ({
  archiveThread,
  archivingThread,
  autoSubmitThreadId,
  cancelThreadTransition,
  completeAutoSubmit,
  completeInitialComposerHandoff,
  confirmThreadTransition,
  createFromDraft,
  creatingThread,
  disabled,
  handleTransitionOpenChange,
  initialComposerHandoff,
  interactionDisabled,
  organizationId,
  organizationSlug,
  pendingTransition,
  presentation,
  selectedThread,
  selectThread,
  setShortcutHelpOpen,
  shortcutHelpOpen,
  startThread,
  threads,
  threadsError,
  threadsLoading,
}: AgentDashboardViewProps) => (
  <>
    <div
      className={cn(
        "min-w-0 gap-4",
        presentation === "shell"
          ? "flex min-h-0 flex-1 flex-col"
          : "grid min-h-136 lg:grid-cols-[15rem_minmax(0,1fr)]"
      )}
    >
      {presentation === "shell" ? (
        <AgentThreadToolbar
          threads={threads}
          selectedThread={selectedThread}
          loading={threadsLoading}
          error={threadsError}
          creating={creatingThread}
          archiving={archivingThread}
          disabled={interactionDisabled}
          onSelect={selectThread}
          onCreate={startThread}
          onArchive={archiveThread}
        />
      ) : (
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Private threads</CardTitle>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="New agent thread"
              disabled={creatingThread || interactionDisabled}
              onClick={startThread}
            >
              {creatingThread ? <Spinner /> : <MessageSquarePlusIcon />}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {threads.map((thread) => (
              <AgentThreadItem
                key={thread.id}
                thread={thread}
                selected={thread.id === selectedThread?.id}
                disabled={archivingThread || interactionDisabled}
                onSelect={selectThread}
                onArchive={archiveThread}
              />
            ))}
            {threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Create a private thread to start working with the Issue agent.
              </p>
            ) : null}
            {threadsError ? (
              <p role="alert" className="text-sm text-destructive">
                Agent threads could not be loaded.
              </p>
            ) : null}
            <p className="pt-2 text-xs text-muted-foreground">
              Unsent text and staged images stay with their thread. Archiving
              that thread discards the draft and deletes its temporary images.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedThread ? (
        <AgentConversation
          key={selectedThread.id}
          organizationId={organizationId}
          organizationSlug={organizationSlug}
          thread={selectedThread}
          presentation={presentation}
          disabled={
            disabled || pendingTransition !== undefined || shortcutHelpOpen
          }
          autoSubmit={autoSubmitThreadId === selectedThread.id}
          onAutoSubmit={completeAutoSubmit}
          initialComposerSnapshot={
            initialComposerHandoff?.threadId === selectedThread.id
              ? initialComposerHandoff.snapshot
              : undefined
          }
          onInitialComposerSnapshotConsumed={completeInitialComposerHandoff}
        />
      ) : (
        <AgentNewThreadComposer
          organizationId={organizationId}
          disabled={interactionDisabled}
          creating={creatingThread}
          onCreate={createFromDraft}
        />
      )}
    </div>
    <AlertDialog
      open={pendingTransition !== undefined}
      onOpenChange={handleTransitionOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingTransition?.kind === "archive"
              ? "Archive this Agent thread?"
              : "Switch Agent threads?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingTransition?.kind === "archive"
              ? "Archiving permanently discards this thread's unsent text and staged images. Temporary images are deleted from storage, and any upload or active response is stopped."
              : "Unsent text and staged images stay with the current thread. In-progress uploads and the active response will stop; pending approvals stay with this thread."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelThreadTransition}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant={
              pendingTransition?.kind === "archive" ? "destructive" : "default"
            }
            onClick={confirmThreadTransition}
          >
            {pendingTransition?.kind === "archive"
              ? "Archive and discard"
              : "Stop and switch"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AgentShortcutHelp
      open={shortcutHelpOpen}
      onOpenChange={setShortcutHelpOpen}
    />
  </>
)
