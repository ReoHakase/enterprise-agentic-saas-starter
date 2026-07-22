"use client"

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
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MessageSquarePlusIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { archiveAgentThread, createAgentThread } from "@/features/agent/api"
import { AgentConversation } from "@/features/agent/components/agent-conversation"
import { AgentNewThreadComposer } from "@/features/agent/components/agent-new-thread-composer"
import { AgentShortcutHelp } from "@/features/agent/components/agent-shortcut-help"
import {
  AgentThreadItem,
  AgentThreadToolbar,
} from "@/features/agent/components/agent-thread-picker"
import { isAgentHotkeyAllowed } from "@/features/agent/hotkey-scope"
import { agentKeys, agentThreadsQueryOptions } from "@/features/agent/queries"
import {
  hasBlockingThreadSwitchRisks,
  useAgentRuntimeState,
  type AgentThreadSwitchRisks,
} from "@/features/agent/runtime-state"
import type { AgentThread } from "@/features/agent/schema"
import { useIssueSearchState } from "@/features/issues/search-params"
import { apiClient } from "@/lib/api-client"

const emptyAgentThreads: AgentThread[] = []

type PendingThreadTransition =
  | {
      kind: "switch"
      sourceThreadId: string
      targetThreadId: string | null
      risks: AgentThreadSwitchRisks
    }
  | {
      kind: "archive"
      thread: AgentThread
      risks: AgentThreadSwitchRisks
    }

export const AgentDashboard = ({
  organizationId,
  organizationSlug,
  presentation = "page",
  disabled = false,
}: {
  organizationId: string
  organizationSlug: string
  presentation?: "page" | "shell"
  disabled?: boolean
}) => {
  const queryClient = useQueryClient()
  const runtime = useAgentRuntimeState()
  const { state, setDiscrete } = useIssueSearchState()
  const [pendingTransition, setPendingTransition] =
    useState<PendingThreadTransition>()
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [draftOpen, setDraftOpen] = useState(state.agentThread === null)
  const [autoSubmitThreadId, setAutoSubmitThreadId] = useState<string>()
  const threadsQuery = useQuery(
    agentThreadsQueryOptions(apiClient, organizationId)
  )
  const selectedThread = threadsQuery.data?.find(
    (thread) => thread.id === state.agentThread
  )
  const interactionDisabled = disabled || runtime.frozen
  const finishThreadSelection = useCallback(
    async (sourceThreadId: string, targetThreadId: string | null) => {
      try {
        await runtime.completeThreadSwitch(sourceThreadId, {
          discardDraft: false,
        })
        setDraftOpen(targetThreadId === null)
        await setDiscrete({ agentThread: targetThreadId }, { history: "push" })
      } finally {
        runtime.cancelThreadSwitch()
      }
    },
    [runtime, setDiscrete]
  )
  const requestThreadSelection = useCallback(
    (targetThreadId: string) => {
      const sourceThreadId = selectedThread?.id
      if (sourceThreadId === targetThreadId) return
      if (!sourceThreadId) {
        setDraftOpen(false)
        void setDiscrete({ agentThread: targetThreadId }, { history: "push" })
        return
      }

      const risks = runtime.beginThreadSwitch(sourceThreadId)
      if (hasBlockingThreadSwitchRisks(risks)) {
        setPendingTransition({
          kind: "switch",
          sourceThreadId,
          targetThreadId,
          risks,
        })
        return
      }
      void finishThreadSelection(sourceThreadId, targetThreadId)
    },
    [finishThreadSelection, runtime, selectedThread?.id, setDiscrete]
  )
  const createThreadMutation = useMutation({
    mutationFn: async (input: {
      composer: string
      files: File[]
      autoSubmit: boolean
    }) => {
      const thread = await createAgentThread(apiClient)
      runtime.setThreadComposer(thread.id, input.composer)
      let uploadError: unknown
      try {
        if (input.files.length > 0) {
          await runtime.uploadImages(thread.id, input.files)
        }
      } catch (error) {
        uploadError = error
      }
      return { thread, autoSubmit: input.autoSubmit, uploadError }
    },
    onSuccess: async ({ thread, autoSubmit, uploadError }) => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.threads(organizationId),
      })
      setDraftOpen(false)
      setAutoSubmitThreadId(autoSubmit ? thread.id : undefined)
      await setDiscrete({ agentThread: thread.id }, { history: "push" })
      if (uploadError) {
        toast.error(
          uploadError instanceof Error
            ? uploadError.message
            : "Image upload failed. The new thread was kept."
        )
      }
    },
    onError: () => toast.error("The Agent thread could not be created."),
  })
  const archiveThreadMutation = useMutation({
    mutationFn: (threadId: string) => archiveAgentThread(apiClient, threadId),
    onSuccess: async (_, threadId) => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.threads(organizationId),
      })
      if (state.agentThread === threadId) {
        setDraftOpen(true)
        await setDiscrete({ agentThread: null }, { history: "replace" })
      }
    },
    onError: () =>
      toast.error(
        "The Agent thread could not be archived. Its discarded local draft cannot be restored."
      ),
    onSettled: () => runtime.cancelThreadSwitch(),
  })
  const { mutate: createDraftThread, isPending: creatingThread } =
    createThreadMutation
  const { mutate: runArchiveThread, isPending: archivingThread } =
    archiveThreadMutation

  useEffect(() => {
    if (
      disabled ||
      !threadsQuery.data ||
      selectedThread ||
      state.agentThread === ""
    )
      return
    const missingThreadId = state.agentThread
    runtime.beginThreadSwitch(missingThreadId)
    void runtime
      .completeThreadSwitch(missingThreadId, { discardDraft: true })
      .then(() => {
        setDraftOpen(true)
        return setDiscrete({ agentThread: null }, { history: "replace" })
      })
      .finally(() => runtime.cancelThreadSwitch())
  }, [
    runtime,
    disabled,
    selectedThread,
    setDiscrete,
    state.agentThread,
    threadsQuery.data,
  ])

  const selectThread = useCallback(
    (threadId: string) => requestThreadSelection(threadId),
    [requestThreadSelection]
  )
  const startThread = useCallback(() => {
    const sourceThreadId = selectedThread?.id
    if (!sourceThreadId) {
      setDraftOpen(true)
      void setDiscrete({ agentThread: null }, { history: "push" })
      return
    }
    const risks = runtime.beginThreadSwitch(sourceThreadId)
    if (hasBlockingThreadSwitchRisks(risks)) {
      setPendingTransition({
        kind: "switch",
        sourceThreadId,
        targetThreadId: null,
        risks,
      })
      return
    }
    void finishThreadSelection(sourceThreadId, null)
  }, [finishThreadSelection, runtime, selectedThread?.id, setDiscrete])
  const createFromDraft = useCallback(
    (composer: string, files: File[], autoSubmit: boolean) =>
      createDraftThread({ composer, files, autoSubmit }),
    [createDraftThread]
  )
  const completeAutoSubmit = useCallback(
    () => setAutoSubmitThreadId(undefined),
    []
  )
  const archiveThread = useCallback(
    (threadId: string) => {
      const thread = threadsQuery.data?.find(
        (candidate) => candidate.id === threadId
      )
      if (!thread) return
      const risks = runtime.beginThreadSwitch(threadId)
      setPendingTransition({ kind: "archive", thread, risks })
    },
    [runtime, threadsQuery.data]
  )
  const cancelThreadTransition = useCallback(() => {
    setPendingTransition(undefined)
    runtime.cancelThreadSwitch()
  }, [runtime])
  const confirmThreadTransition = useCallback(() => {
    const transition = pendingTransition
    if (!transition) return
    setPendingTransition(undefined)
    if (transition.kind === "switch") {
      void finishThreadSelection(
        transition.sourceThreadId,
        transition.targetThreadId
      )
      return
    }
    void runtime
      .completeThreadSwitch(transition.thread.id, { discardDraft: true })
      .then(() => runArchiveThread(transition.thread.id))
      .catch(() => {
        runtime.cancelThreadSwitch()
        toast.error("The local Agent thread draft could not be discarded.")
      })
  }, [finishThreadSelection, pendingTransition, runArchiveThread, runtime])
  const handleTransitionOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelThreadTransition()
    },
    [cancelThreadTransition]
  )
  useHotkeys(
    [
      {
        hotkey: "Mod+Shift+N",
        callback: (event) => {
          if (isAgentHotkeyAllowed(event)) startThread()
        },
        options: { enabled: !interactionDisabled && !creatingThread },
      },
      {
        hotkey: "Alt+ArrowUp",
        callback: (event) => {
          if (!isAgentHotkeyAllowed(event) || !selectedThread) return
          const threads = threadsQuery.data ?? []
          const index = threads.findIndex(
            (item) => item.id === selectedThread.id
          )
          const previous = threads[index - 1]
          if (previous) selectThread(previous.id)
        },
      },
      {
        hotkey: "Alt+ArrowDown",
        callback: (event) => {
          if (!isAgentHotkeyAllowed(event) || !selectedThread) return
          const threads = threadsQuery.data ?? []
          const index = threads.findIndex(
            (item) => item.id === selectedThread.id
          )
          const next = threads[index + 1]
          if (next) selectThread(next.id)
        },
      },
      {
        hotkey: "Mod+/",
        callback: (event) => {
          if (isAgentHotkeyAllowed(event)) setShortcutHelpOpen(true)
        },
      },
    ],
    {
      enabled: !disabled,
      conflictBehavior: "allow",
      meta: { name: "Agent shortcuts", description: "Agent pane commands" },
    }
  )

  return (
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
            threads={threadsQuery.data ?? emptyAgentThreads}
            selectedThread={selectedThread}
            loading={threadsQuery.isPending}
            error={threadsQuery.isError}
            creating={creatingThread}
            archiving={archivingThread}
            disabled={interactionDisabled}
            draftOpen={draftOpen}
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
              {threadsQuery.data?.map((thread) => (
                <AgentThreadItem
                  key={thread.id}
                  thread={thread}
                  selected={thread.id === selectedThread?.id}
                  disabled={archivingThread || interactionDisabled}
                  onSelect={selectThread}
                  onArchive={archiveThread}
                />
              ))}
              {threadsQuery.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create a private thread to start working with the Issue agent.
                </p>
              ) : null}
              {threadsQuery.isError ? (
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
          />
        ) : draftOpen ? (
          <AgentNewThreadComposer
            disabled={interactionDisabled}
            creating={creatingThread}
            onCreate={createFromDraft}
          />
        ) : (
          <Card className="grid min-h-0 flex-1 place-items-center p-8 text-center">
            <div>
              <h2 className="font-semibold">Choose an Agent thread</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Threads are private to you and scoped to the active
                organization.
              </p>
            </div>
          </Card>
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
                pendingTransition?.kind === "archive"
                  ? "destructive"
                  : "default"
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
}
