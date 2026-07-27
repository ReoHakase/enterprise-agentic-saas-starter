"use client"

import { useHotkeys } from "@tanstack/react-hotkeys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { useIssueSearchState } from "@/features/issues/search-params.client"
import { apiClient } from "@/lib/api-client"

import {
  archiveAgentThread,
  createAgentThread,
  updateAgentThreadTitle,
} from "../../api"
import { isAgentHotkeyAllowed } from "../../hotkey-scope"
import { agentKeys, agentThreadsQueryOptions } from "../../queries"
import type { AgentThread } from "../../schema"
import type { AgentComposerSnapshot } from "../agent-composer/agent-composer"
import {
  renderAgentDashboardView,
  type AgentDashboardViewProps,
} from "../agent-dashboard-view/agent-dashboard-view"
import type { AgentNewThreadInput } from "../agent-new-thread-composer/agent-new-thread-composer"
import {
  hasBlockingThreadSwitchRisks,
  useAgentRuntimeState,
  type AgentThreadSwitchRisks,
} from "../runtime-state/runtime-state"

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

type AgentDashboardProps = {
  organizationId: string
  organizationSlug: string
  presentation?: "page" | "shell"
  disabled?: boolean
}

const useAgentDashboardHotkeys = ({
  creatingThread,
  disabled,
  interactionDisabled,
  selectedThread,
  selectThread,
  setShortcutHelpOpen,
  startThread,
  threads,
}: {
  creatingThread: boolean
  disabled: boolean
  interactionDisabled: boolean
  selectedThread?: AgentThread
  selectThread: (threadId: string) => void
  setShortcutHelpOpen: (open: boolean) => void
  startThread: () => void
  threads: AgentThread[]
}) =>
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

const useMissingAgentThreadCleanup = ({
  disabled,
  runtime,
  selectedThread,
  setDiscrete,
  threadId,
  threads,
}: {
  disabled: boolean
  runtime: ReturnType<typeof useAgentRuntimeState>
  selectedThread?: AgentThread
  setDiscrete: ReturnType<typeof useIssueSearchState>["setDiscrete"]
  threadId: string
  threads?: AgentThread[]
}) => {
  useEffect(() => {
    if (disabled || !threads || selectedThread || threadId === "") return
    runtime.beginThreadSwitch(threadId)
    void runtime
      .completeThreadSwitch(threadId, { discardDraft: true })
      .then(() => setDiscrete({ agentThread: null }, { history: "replace" }))
      .finally(() => runtime.cancelThreadSwitch())
  }, [disabled, runtime, selectedThread, setDiscrete, threadId, threads])
}

const useThreadTransitionActions = ({
  finishThreadSelection,
  pendingTransition,
  runArchiveThread,
  runtime,
  setPendingTransition,
}: {
  finishThreadSelection: (
    sourceThreadId: string,
    targetThreadId: string | null
  ) => Promise<void>
  pendingTransition?: PendingThreadTransition
  runArchiveThread: (threadId: string) => void
  runtime: ReturnType<typeof useAgentRuntimeState>
  setPendingTransition: (transition?: PendingThreadTransition) => void
}) => {
  const cancelThreadTransition = useCallback(() => {
    setPendingTransition(undefined)
    runtime.cancelThreadSwitch()
  }, [runtime, setPendingTransition])
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
  }, [
    finishThreadSelection,
    pendingTransition,
    runArchiveThread,
    runtime,
    setPendingTransition,
  ])
  const handleTransitionOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelThreadTransition()
    },
    [cancelThreadTransition]
  )
  return {
    cancelThreadTransition,
    confirmThreadTransition,
    handleTransitionOpenChange,
  }
}

const useAgentDashboardController = ({
  organizationId,
  organizationSlug,
  presentation = "page",
  disabled = false,
}: AgentDashboardProps) => {
  const queryClient = useQueryClient()
  const runtime = useAgentRuntimeState()
  const { state, setDiscrete } = useIssueSearchState()
  const [pendingTransition, setPendingTransition] =
    useState<PendingThreadTransition>()
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [autoSubmitThreadId, setAutoSubmitThreadId] = useState<string>()
  const [initialComposerHandoff, setInitialComposerHandoff] = useState<{
    threadId: string
    snapshot: AgentComposerSnapshot
  }>()
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
    mutationFn: async (input: AgentNewThreadInput) => {
      const thread = await createAgentThread(apiClient, input.permissionMode)
      runtime.setThreadComposer(thread.id, input.composer)
      let uploadError: unknown
      try {
        if (input.files.length > 0) {
          await runtime.uploadImages(thread.id, input.files)
        }
      } catch (error) {
        uploadError = error
      }
      return {
        thread,
        autoSubmit: input.autoSubmit,
        snapshot: input.snapshot,
        uploadError,
      }
    },
    onSuccess: async ({ thread, autoSubmit, snapshot, uploadError }) => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.threads(organizationId),
      })
      setInitialComposerHandoff({ threadId: thread.id, snapshot })
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
  const renameThreadMutation = useMutation({
    mutationFn: (input: { thread: AgentThread; title: string }) =>
      updateAgentThreadTitle(apiClient, {
        threadId: input.thread.id,
        title: input.title,
        expectedRevision: input.thread.titleRevision,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.threads(organizationId),
      })
    },
    onError: () =>
      toast.error("The thread title changed elsewhere. Reload and try again."),
  })
  const { mutate: runRenameThread, isPending: renamingThread } =
    renameThreadMutation
  const renameThread = useCallback(
    (thread: AgentThread, title: string) => runRenameThread({ thread, title }),
    [runRenameThread]
  )

  useMissingAgentThreadCleanup({
    disabled,
    runtime,
    selectedThread,
    setDiscrete,
    threadId: state.agentThread,
    threads: threadsQuery.data,
  })

  const selectThread = useCallback(
    (threadId: string) => requestThreadSelection(threadId),
    [requestThreadSelection]
  )
  const startThread = useCallback(() => {
    const sourceThreadId = selectedThread?.id
    if (!sourceThreadId) {
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
    (input: AgentNewThreadInput) => createDraftThread(input),
    [createDraftThread]
  )
  const completeAutoSubmit = useCallback(
    () => setAutoSubmitThreadId(undefined),
    []
  )
  const completeInitialComposerHandoff = useCallback((threadId: string) => {
    setInitialComposerHandoff((current) =>
      current?.threadId === threadId ? undefined : current
    )
  }, [])
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
  const {
    cancelThreadTransition,
    confirmThreadTransition,
    handleTransitionOpenChange,
  } = useThreadTransitionActions({
    finishThreadSelection,
    pendingTransition,
    runArchiveThread,
    runtime,
    setPendingTransition,
  })
  useAgentDashboardHotkeys({
    creatingThread,
    disabled,
    interactionDisabled,
    selectedThread,
    selectThread,
    setShortcutHelpOpen,
    startThread,
    threads: threadsQuery.data ?? emptyAgentThreads,
  })

  return {
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
    renameThread,
    renamingThread,
    selectedThread,
    selectThread,
    setShortcutHelpOpen,
    shortcutHelpOpen,
    startThread,
    threads: threadsQuery.data ?? emptyAgentThreads,
    threadsError: threadsQuery.isError,
    threadsLoading: threadsQuery.isPending,
  } satisfies AgentDashboardViewProps
}

export const AgentDashboard = (props: AgentDashboardProps) => {
  const controller = useAgentDashboardController(props)
  return renderAgentDashboardView(controller)
}
