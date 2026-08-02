import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type {
  ChatOnErrorCallback,
  ChatOnFinishCallback,
  ChatOnToolCallCallback,
} from "ai"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import type {
  AgentComposerHandle,
  AgentComposerSnapshot,
} from "../components/agent-composer/agent-composer"
import type { AgentChatMessage } from "../schema"
import type { PendingChatSubmission } from "../submission-identity"

type AgentChatOptions = {
  onError?: ChatOnErrorCallback
  onFinish?: ChatOnFinishCallback<AgentChatMessage>
  onToolCall?: ChatOnToolCallCallback<AgentChatMessage>
}
type AgentRunStatus =
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "canceled"
  | "expired"
type ControllerMocks = {
  addToolOutput: Mock<() => void>
  cancelAgentRun: Mock<() => Promise<{ runId: string; status: AgentRunStatus }>>
  chatOptions: AgentChatOptions | undefined
  clearError: Mock<() => void>
  error: Error | undefined
  messages: AgentChatMessage[]
  patchForm: Mock<() => Promise<unknown>>
  reportObservedError: Mock<(error: unknown) => void>
  sendMessage: Mock<(message: { id: string }) => Promise<void>>
  status: "ready" | "streaming"
  stop: Mock<() => Promise<void>>
}

const mocks = vi.hoisted<ControllerMocks>(() => ({
  addToolOutput: vi.fn<() => void>(),
  cancelAgentRun: vi.fn<
    () => Promise<{ runId: string; status: AgentRunStatus }>
  >(() => Promise.resolve({ runId: "run_default", status: "canceled" })),
  chatOptions: undefined,
  clearError: vi.fn<() => void>(),
  error: undefined,
  messages: [
    {
      id: "assistant-partial",
      role: "assistant",
      parts: [{ type: "text", text: "Partial answer stays visible." }],
    },
  ],
  patchForm: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
  reportObservedError: vi.fn<(error: unknown) => void>(),
  sendMessage: vi.fn<(message: { id: string }) => Promise<void>>(() =>
    Promise.resolve()
  ),
  status: "streaming",
  stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: Record<string, (...args: never[]) => unknown>) => {
    mocks.chatOptions = options
    return {
      addToolOutput: mocks.addToolOutput,
      clearError: mocks.clearError,
      error: mocks.error,
      messages: mocks.messages,
      sendMessage: mocks.sendMessage,
      status: mocks.status,
      stop: mocks.stop,
    }
  },
}))
vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkeys: vi.fn<() => void>(),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(href: string) => void>() }),
}))
vi.mock("../api", () => ({ cancelAgentRun: mocks.cancelAgentRun }))
vi.mock("./use-agent-mention-candidates", () => ({
  useAgentMentionCandidates: () => [],
}))
vi.mock("../components/form-registry/form-registry", () => ({
  useAgentFormRegistry: () => ({
    patch: mocks.patchForm,
    read: vi.fn<() => void>(),
  }),
}))
vi.mock("@/features/issues", () => ({
  issueKeys: { all: ["issues"] },
}))
vi.mock("@/features/issues/search-params.client", () => ({
  useIssueSearchState: () => ({ state: {} }),
}))
vi.mock("@/lib/report-observed-error", () => ({
  reportObservedError: mocks.reportObservedError,
}))

type RuntimeMock = {
  clearStagedAssetsAfterSend: Mock<() => void>
  frozen: boolean
  pendingSubmission: PendingChatSubmission | undefined
  registerSession: Mock<() => () => void>
  setComposer: Mock<(value: string) => void>
  setPendingSubmission: Mock<
    (submission: PendingChatSubmission | undefined) => void
  >
  stagedAssets: []
  uploadingCount: number
  uploadImages: Mock<() => Promise<void>>
}

const runtime: RuntimeMock = {
  clearStagedAssetsAfterSend: vi.fn<() => void>(),
  frozen: false,
  pendingSubmission: undefined,
  registerSession: vi.fn<() => () => void>(() => () => undefined),
  setComposer: vi.fn<(value: string) => void>(),
  setPendingSubmission:
    vi.fn<(submission: PendingChatSubmission | undefined) => void>(),
  stagedAssets: [],
  uploadingCount: 0,
  uploadImages: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}
vi.mock("../components/runtime-state/runtime-state", () => ({
  useAgentThreadRuntimeState: () => runtime,
}))

import { useAgentController } from "./use-agent-controller"

const voidMock = () => vi.fn<() => void>()
const assistantMessage: AgentChatMessage = {
  id: "assistant-finish",
  role: "assistant",
  parts: [{ type: "text", text: "Finished." }],
}
const finishEvent = (
  input: Partial<Parameters<ChatOnFinishCallback<AgentChatMessage>>[0]> = {}
): Parameters<ChatOnFinishCallback<AgentChatMessage>>[0] => ({
  message: assistantMessage,
  messages: [assistantMessage],
  isAbort: false,
  isDisconnect: false,
  isError: false,
  ...input,
})
const composerSnapshot = (text: string): AgentComposerSnapshot => ({
  document: { type: "doc", content: [] },
  parts: [{ type: "text", text }],
})
const createComposer = (
  readText: () => string,
  writeText?: (text: string) => void
) =>
  ({
    clear: vi.fn<() => void>(() => writeText?.("")),
    focus: vi.fn<() => void>(),
    restore: vi.fn<(snapshot: AgentComposerSnapshot) => void>((snapshot) => {
      const textPart = snapshot.parts.find((part) => part.type === "text")
      writeText?.(textPart?.text ?? "")
    }),
    snapshot: () => composerSnapshot(readText()),
  }) satisfies AgentComposerHandle
const submitEvent = () => ({ preventDefault: voidMock() })

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false },
        },
      })
    }
  >
    {children}
  </QueryClientProvider>
)

const renderController = (threadTitle = "Thread") =>
  renderHook(
    () =>
      useAgentController({
        autoSubmit: false,
        disabled: false,
        initialMessages: [],
        onAutoSubmit: voidMock(),
        organizationId: "organization_1",
        organizationSlug: "acme",
        thread: {
          id: "thread_1",
          title: threadTitle,
          status: "active",
          createdAt: "2026-07-28T00:00:00.000Z",
          updatedAt: "2026-07-28T00:00:00.000Z",
        },
      }),
    { wrapper }
  )

const observeRunMetadata = (
  rerender: ReturnType<typeof renderController>["rerender"],
  runId: string
) => {
  const latestAssistantIndex = mocks.messages.findLastIndex(
    (message) => message.role === "assistant"
  )
  if (latestAssistantIndex < 0) throw new Error("Assistant message is required")
  const latestAssistant = mocks.messages[latestAssistantIndex]
  if (!latestAssistant) throw new Error("Assistant message is required")
  mocks.messages = mocks.messages.with(latestAssistantIndex, {
    ...latestAssistant,
    metadata: { ...latestAssistant.metadata, runId },
  })
  rerender()
}

const resetControllerMocks = () => {
  vi.clearAllMocks()
  mocks.chatOptions = undefined
  mocks.error = undefined
  mocks.messages = [
    {
      id: "assistant-partial",
      role: "assistant",
      parts: [{ type: "text", text: "Partial answer stays visible." }],
    },
  ]
  mocks.status = "streaming"
  mocks.stop.mockResolvedValue(undefined)
  mocks.patchForm.mockResolvedValue({})
  runtime.pendingSubmission = undefined
  runtime.setPendingSubmission.mockImplementation((submission) => {
    runtime.pendingSubmission = submission
  })
}

describe("useAgentController Stop lifecycle", () => {
  beforeEach(resetControllerMocks)

  it("handles three Stop cycles without deleting partial output", async () => {
    const { result, rerender } = renderController()

    act(() => observeRunMetadata(rerender, "run_1"))
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    await waitFor(() =>
      expect(mocks.cancelAgentRun).toHaveBeenCalledWith(expect.anything(), {
        runId: "run_1",
        threadId: "thread_1",
      })
    )

    act(() => observeRunMetadata(rerender, "run_2"))
    mocks.cancelAgentRun.mockRejectedValueOnce(new Error("temporary failure"))
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(false)
    })
    expect(result.current.cancelState).toBe("failed")
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    await waitFor(() =>
      expect(mocks.cancelAgentRun).toHaveBeenCalledWith(expect.anything(), {
        runId: "run_2",
        threadId: "thread_1",
      })
    )
    await waitFor(() => expect(result.current.cancelState).toBe("idle"))

    act(() => observeRunMetadata(rerender, "run_3"))
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    await waitFor(() =>
      expect(mocks.cancelAgentRun).toHaveBeenCalledWith(expect.anything(), {
        runId: "run_3",
        threadId: "thread_1",
      })
    )

    expect(mocks.stop).toHaveBeenCalledTimes(3)
    expect(mocks.cancelAgentRun).toHaveBeenCalledTimes(4)
    expect(result.current.chat.messages).toEqual([
      {
        id: "assistant-partial",
        metadata: { runId: "run_3" },
        role: "assistant",
        parts: [{ type: "text", text: "Partial answer stays visible." }],
      },
    ])
    expect(result.current.turnStopped).toBe(true)
  })

  it("keeps the stream open for a run identity after an early Stop request", async () => {
    const { result, rerender } = renderController()

    let stopPromise: Promise<boolean> | undefined
    act(() => {
      stopPromise = result.current.stopCurrentTurn()
    })
    expect(mocks.stop).not.toHaveBeenCalled()
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.cancelState).toBe("canceling")
    act(() => observeRunMetadata(rerender, "run_queued"))
    await waitFor(() =>
      expect(mocks.cancelAgentRun).toHaveBeenCalledWith(expect.anything(), {
        runId: "run_queued",
        threadId: "thread_1",
      })
    )
    await act(async () => {
      await expect(stopPromise).resolves.toBe(true)
    })
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(result.current.cancelState).toBe("idle")
    expect(result.current.turnStopped).toBe(true)
  })

  it("does not reuse settled message metadata for the next early Stop", async () => {
    const previousAssistant = {
      id: "assistant-previous",
      metadata: { runId: "run_previous" },
      role: "assistant",
      parts: [{ type: "text", text: "Previous answer." }],
    } satisfies AgentChatMessage
    mocks.messages = [previousAssistant]
    mocks.status = "ready"
    const { result, rerender } = renderController()

    await act(async () => {
      await mocks.chatOptions?.onFinish?.(
        finishEvent({
          message: previousAssistant,
          messages: [previousAssistant],
        })
      )
    })
    mocks.messages = [
      previousAssistant,
      {
        id: "user-current",
        role: "user",
        parts: [{ type: "text", text: "Current request." }],
      },
    ]
    mocks.status = "streaming"
    rerender()

    let stopPromise: Promise<boolean> | undefined
    act(() => {
      stopPromise = result.current.stopCurrentTurn()
    })
    expect(mocks.cancelAgentRun).not.toHaveBeenCalled()

    mocks.messages = [
      ...mocks.messages,
      {
        id: "assistant-current",
        metadata: { runId: "run_current" },
        role: "assistant",
        parts: [{ type: "text", text: "Current partial answer." }],
      },
    ]
    rerender()
    await act(async () => {
      await expect(stopPromise).resolves.toBe(true)
    })

    expect(mocks.cancelAgentRun).toHaveBeenCalledOnce()
    expect(mocks.cancelAgentRun).toHaveBeenCalledWith(expect.anything(), {
      runId: "run_current",
      threadId: "thread_1",
    })
  })

  it("deduplicates same-microtask Stop calls before React rerenders", async () => {
    let resolveCancel:
      | ((value: { runId: string; status: AgentRunStatus }) => void)
      | undefined
    mocks.cancelAgentRun.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCancel = resolve
        })
    )
    const { result, rerender } = renderController()
    act(() => observeRunMetadata(rerender, "run_deduplicated"))
    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    act(() => {
      first = result.current.stopCurrentTurn()
      second = result.current.stopCurrentTurn()
    })
    expect(second).toBe(first)
    resolveCancel?.({ runId: "run_deduplicated", status: "canceled" })
    await act(async () => {
      await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    })
    expect(mocks.cancelAgentRun).toHaveBeenCalledOnce()
    expect(mocks.stop).toHaveBeenCalledOnce()
  })

  it("cancels an approval-waiting run even when chat transport is ready", async () => {
    mocks.status = "ready"
    mocks.messages = [
      {
        id: "approval-message",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "create_issue",
            toolCallId: "approval-call",
            state: "output-available",
            input: {},
            output: { status: "pending", actionId: "approval-action" },
          },
        ],
      },
    ]
    const { result, rerender } = renderController()
    act(() => observeRunMetadata(rerender, "run_waiting_approval"))
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    expect(mocks.cancelAgentRun).toHaveBeenCalledWith(expect.anything(), {
      runId: "run_waiting_approval",
      threadId: "thread_1",
    })
  })

  it("settles Stop after local abort without waiting for query refetch", async () => {
    const invalidate = vi
      .spyOn(QueryClient.prototype, "invalidateQueries")
      .mockImplementation(() => new Promise(() => undefined))
    const { result, rerender } = renderController()
    act(() => observeRunMetadata(rerender, "run_refetch"))
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledTimes(3)
    invalidate.mockRestore()
  })

  it("waits for authoritative cancel and allows the next send after a non-canceled terminal", async () => {
    let resolveCancel:
      | ((value: { runId: string; status: AgentRunStatus }) => void)
      | undefined
    mocks.cancelAgentRun.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCancel = resolve
        })
    )
    const { result, rerender } = renderController()
    act(() => observeRunMetadata(rerender, "run_deferred"))

    let stopPromise: Promise<boolean> | undefined
    act(() => {
      stopPromise = result.current.stopCurrentTurn()
    })
    expect(mocks.cancelAgentRun).toHaveBeenCalledOnce()
    expect(mocks.stop).not.toHaveBeenCalled()
    await act(async () => {
      resolveCancel?.({ runId: "run_deferred", status: "canceled" })
      await mocks.chatOptions?.onFinish?.(
        finishEvent({
          isAbort: false,
          isDisconnect: false,
          isError: false,
        })
      )
      await expect(stopPromise).resolves.toBe(true)
    })
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce())
    expect(result.current.turnStopped).toBe(true)
    expect(result.current.cancelState).toBe("idle")
    expect(runtime.setPendingSubmission).toHaveBeenCalledTimes(1)

    act(() => observeRunMetadata(rerender, "run_failed"))
    mocks.cancelAgentRun.mockResolvedValueOnce({
      runId: "run_failed",
      status: "failed",
    })
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    expect(mocks.stop).toHaveBeenCalledTimes(2)
    expect(result.current.turnStopped).toBe(false)
    expect(result.current.cancelState).toBe("idle")

    mocks.status = "ready"
    rerender()
    const composer = createComposer(() => "next message")
    result.current.composerRef.current = composer
    await act(async () => {
      await result.current.submitMessage(submitEvent())
    })
    expect(mocks.sendMessage).toHaveBeenCalledOnce()
  })

  it("keeps transport cancel failures retryable", async () => {
    const { result, rerender } = renderController()
    act(() => observeRunMetadata(rerender, "run_retry"))
    mocks.cancelAgentRun.mockRejectedValueOnce(new Error("network failure"))

    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(false)
    })
    expect(result.current.cancelState).toBe("failed")
    expect(result.current.turnStopped).toBe(false)

    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    expect(result.current.cancelState).toBe("idle")
    expect(mocks.cancelAgentRun).toHaveBeenCalledTimes(2)
  })

  it("fails closed when an early Stop aborts without a run identity", async () => {
    let resolveStop: (() => void) | undefined
    mocks.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve
        })
    )
    const { result, rerender } = renderController()

    let stopPromise: Promise<boolean> | undefined
    act(() => {
      stopPromise = result.current.stopCurrentTurn()
    })
    expect(mocks.stop).not.toHaveBeenCalled()
    await act(async () => {
      await mocks.chatOptions?.onError?.(new Error("late setup abort"))
    })
    mocks.error = new Error("late setup abort")
    mocks.status = "ready"
    rerender()
    expect(result.current.cancelState).toBe("canceling")
    await act(async () => {
      await mocks.chatOptions?.onFinish?.(
        finishEvent({
          isAbort: true,
          isDisconnect: false,
          isError: false,
        })
      )
      resolveStop?.()
      await expect(stopPromise).resolves.toBe(false)
    })
    act(() => observeRunMetadata(rerender, "run_after_terminal"))

    expect(result.current.cancelState).toBe("idle")
    await waitFor(() => expect(mocks.clearError).toHaveBeenCalled())
    expect(mocks.cancelAgentRun).not.toHaveBeenCalled()
    expect(result.current.turnStopped).toBe(false)
  })

  it("bounds an early Stop when no run identity or terminal callback arrives", async () => {
    vi.useFakeTimers()
    mocks.status = "ready"
    let composerText = "retry after early Stop timeout"
    const composer = createComposer(
      () => composerText,
      (text) => {
        composerText = text
      }
    )
    mocks.stop.mockImplementationOnce(async () => {
      mocks.status = "ready"
    })
    const { result, rerender } = renderController()
    result.current.composerRef.current = composer
    try {
      await act(async () => {
        await result.current.submitMessage(submitEvent())
      })
      const firstId = mocks.sendMessage.mock.calls[0]?.[0].id
      mocks.status = "streaming"
      rerender()

      let stopPromise: Promise<boolean> | undefined
      act(() => {
        stopPromise = result.current.stopCurrentTurn()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
        await expect(stopPromise).resolves.toBe(false)
      })
      rerender()
      expect(mocks.stop).toHaveBeenCalledOnce()
      expect(result.current.cancelState).toBe("idle")
      expect(result.current.busy).toBe(false)
      expect(mocks.cancelAgentRun).not.toHaveBeenCalled()
      expect(runtime.pendingSubmission?.id).toBe(firstId)
      expect(composerText).toBe("retry after early Stop timeout")

      await act(async () => {
        await result.current.submitMessage(submitEvent())
      })
      expect(mocks.sendMessage.mock.calls[1]?.[0].id).toBe(firstId)
    } finally {
      vi.useRealTimers()
    }
  })

  it("reuses the submission after a no-run terminal disconnect fails closed", async () => {
    mocks.status = "ready"
    let composerText = "retry after early disconnect"
    const composer = createComposer(
      () => composerText,
      (text) => {
        composerText = text
      }
    )
    const { result, rerender } = renderController()
    result.current.composerRef.current = composer
    await act(async () => {
      await result.current.submitMessage(submitEvent())
    })
    const firstId = mocks.sendMessage.mock.calls[0]?.[0].id
    mocks.status = "streaming"
    rerender()
    let stopPromise: Promise<boolean> | undefined
    act(() => {
      stopPromise = result.current.stopCurrentTurn()
    })
    await act(async () => {
      await mocks.chatOptions?.onFinish?.(
        finishEvent({
          isAbort: false,
          isDisconnect: true,
          isError: false,
        })
      )
      await expect(stopPromise).resolves.toBe(false)
    })
    expect(result.current.cancelState).toBe("idle")
    expect(runtime.pendingSubmission?.id).toBe(firstId)
    expect(composerText).toBe("retry after early disconnect")

    mocks.status = "ready"
    rerender()
    await act(async () => {
      await result.current.submitMessage(submitEvent())
    })
    expect(mocks.sendMessage.mock.calls[1]?.[0].id).toBe(firstId)
  })
})

describe("useAgentController Stop submission recovery", () => {
  beforeEach(resetControllerMocks)

  it("uses a fresh submission identity after each of three Stop cycles", async () => {
    mocks.status = "ready"
    let composerText = "message 1"
    const composer = createComposer(() => composerText)
    const { result, rerender } = renderController()
    result.current.composerRef.current = composer

    for (const [index, runId] of ["run_1", "run_2", "run_3"].entries()) {
      composerText = `message ${index + 1}`
      // oxlint-disable-next-line no-await-in-loop -- each send must establish its own pending identity before Stop.
      await act(async () => {
        await result.current.submitMessage(submitEvent())
      })
      mocks.status = "streaming"
      rerender()
      // oxlint-disable-next-line no-await-in-loop -- run identity arrives after the corresponding submission.
      act(() => observeRunMetadata(rerender, runId))
      // oxlint-disable-next-line no-await-in-loop -- cancellation must settle before the next submission.
      await act(async () => {
        await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
      })
      expect(result.current.cancelState).toBe("idle")
      mocks.status = "ready"
      rerender()
    }

    const ids = mocks.sendMessage.mock.calls.map(([message]) => message.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    expect(mocks.cancelAgentRun).toHaveBeenCalledTimes(3)
    expect(runtime.setPendingSubmission).toHaveBeenCalledWith(undefined)
  })

  it.each([
    {
      status: "canceled",
      settled: true,
      restoresDraft: true,
      retainsSubmission: false,
      turnStopped: true,
    },
    {
      status: "completed",
      settled: true,
      restoresDraft: false,
      retainsSubmission: false,
      turnStopped: false,
    },
    {
      status: "failed",
      settled: true,
      restoresDraft: true,
      retainsSubmission: true,
      turnStopped: false,
    },
    {
      status: "expired",
      settled: true,
      restoresDraft: true,
      retainsSubmission: true,
      turnStopped: false,
    },
  ] as const)(
    "applies $status Stop semantics to the draft and submission identity",
    async ({
      retainsSubmission,
      restoresDraft,
      settled,
      status,
      turnStopped,
    }) => {
      mocks.status = "ready"
      let composerText = "retry this request"
      const composer = createComposer(
        () => composerText,
        (text) => {
          composerText = text
        }
      )
      const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries")
      const { result, rerender } = renderController()
      result.current.composerRef.current = composer
      await act(async () => {
        await result.current.submitMessage(submitEvent())
      })
      const initialId = mocks.sendMessage.mock.calls[0]?.[0].id
      expect(initialId).toBeTypeOf("string")
      mocks.status = "streaming"
      rerender()
      act(() => observeRunMetadata(rerender, `run_${status}`))
      mocks.cancelAgentRun.mockResolvedValueOnce({
        runId: `run_${status}`,
        status,
      })

      await act(async () => {
        await expect(result.current.stopCurrentTurn()).resolves.toBe(settled)
      })

      expect(composer.restore).toHaveBeenCalledTimes(restoresDraft ? 1 : 0)
      expect(runtime.pendingSubmission?.id).toBe(
        retainsSubmission ? initialId : undefined
      )
      expect(result.current.turnStopped).toBe(turnStopped)
      expect(invalidate).toHaveBeenCalledTimes(
        status === "completed" || status === "canceled" ? 3 : 0
      )

      if (!restoresDraft) composerText = "next request"
      mocks.status = "ready"
      rerender()
      await act(async () => {
        await result.current.submitMessage(submitEvent())
      })
      const nextId = mocks.sendMessage.mock.calls[1]?.[0].id
      expect(nextId).toBeTypeOf("string")
      expect(nextId === initialId).toBe(retainsSubmission)
      invalidate.mockRestore()
    }
  )

  it("retains the draft and submission identity until a failed cancel retry is canceled", async () => {
    mocks.status = "ready"
    let composerText = "retry transport failure"
    const composer = createComposer(
      () => composerText,
      (text) => {
        composerText = text
      }
    )
    const { result, rerender } = renderController()
    result.current.composerRef.current = composer
    await act(async () => {
      await result.current.submitMessage(submitEvent())
    })
    const initialId = mocks.sendMessage.mock.calls[0]?.[0].id
    mocks.status = "streaming"
    rerender()
    act(() => observeRunMetadata(rerender, "run_transport"))
    mocks.cancelAgentRun.mockRejectedValueOnce(new Error("network failure"))

    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(false)
    })
    expect(runtime.pendingSubmission?.id).toBe(initialId)
    expect(composerText).toBe("retry transport failure")

    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    expect(runtime.pendingSubmission).toBeUndefined()
    mocks.status = "ready"
    rerender()
    await act(async () => {
      await result.current.submitMessage(submitEvent())
    })
    expect(mocks.sendMessage.mock.calls[1]?.[0].id).not.toBe(initialId)
  })

  it("preserves a newer composer draft when stopping an earlier submission", async () => {
    mocks.status = "ready"
    let composerText = "original submission"
    const composer = createComposer(() => composerText)
    const { result, rerender } = renderController()
    result.current.composerRef.current = composer
    await act(async () => {
      await result.current.submitMessage(submitEvent())
    })
    composerText = "newer local draft"
    mocks.status = "streaming"
    rerender()
    act(() => observeRunMetadata(rerender, "run_draft"))
    await act(async () => {
      await expect(result.current.stopCurrentTurn()).resolves.toBe(true)
    })
    expect(result.current.cancelState).toBe("idle")

    expect(composer.restore).not.toHaveBeenCalled()
    expect(composer.snapshot()).toMatchObject({
      parts: [{ type: "text", text: "newer local draft" }],
    })
  })

  it("does not echo server-owned tool results through addToolOutput", async () => {
    renderController()

    await act(async () => {
      await mocks.chatOptions?.onToolCall?.({
        toolCall: {
          dynamic: true,
          input: {
            assetIds: ["asset_1"],
            expectedRevision: 1,
            issueId: "issue_1",
          },
          toolCallId: "call_server_tool",
          toolName: "add_issue_attachments",
        },
      })
    })
    expect(mocks.addToolOutput).not.toHaveBeenCalled()
  })

  it("keeps raw client tool failures out of AI SDK history", async () => {
    const error = new Error("DATABASE_URL=file:private-client-tool.db")
    mocks.patchForm.mockRejectedValueOnce(error)
    renderController()

    await act(async () => {
      await mocks.chatOptions?.onToolCall?.({
        toolCall: {
          dynamic: true,
          input: {
            formId: "issue:1",
            expectedEpoch: "epoch-1",
            expectedRevision: 1,
            patch: { title: "Updated" },
          },
          toolCallId: "call_client_tool",
          toolName: "ui_patch_form_draft",
        },
      })
    })

    expect(mocks.reportObservedError).toHaveBeenCalledWith(error)
    expect(mocks.addToolOutput).toHaveBeenCalledWith({
      tool: "ui_patch_form_draft",
      toolCallId: "call_client_tool",
      state: "output-error",
      errorText: "Client tool failed.",
    })
    expect(JSON.stringify(mocks.addToolOutput.mock.calls)).not.toContain(
      "private-client-tool"
    )
  })

  it("invalidates Issue queries after a successful attachment mutation turn", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries")
    const attachmentMessage = {
      id: "assistant-attachment-finish",
      role: "assistant",
      parts: [
        {
          type: "tool-add_issue_attachments",
          toolCallId: "call_attachment_finish",
          state: "output-available",
          input: {
            assetIds: ["asset_1"],
            expectedRevision: 1,
            issueId: "issue_1",
          },
          output: {
            actionId: "action_1",
            operation: "added",
            issueId: "issue_1",
            issueNumber: 7,
            revision: 2,
            fileIds: ["file_1"],
          },
        },
      ],
    } satisfies AgentChatMessage
    renderController()

    await act(async () => {
      await mocks.chatOptions?.onFinish?.(
        finishEvent({
          message: attachmentMessage,
          messages: [attachmentMessage],
        })
      )
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["issues"] })
    invalidate.mockRestore()
  })

  it("refreshes a new thread title until Mastra persists it", async () => {
    vi.useFakeTimers()
    let title = "New conversation"
    const invalidate = vi
      .spyOn(QueryClient.prototype, "invalidateQueries")
      .mockResolvedValue(undefined)
    const getQueryData = vi
      .spyOn(QueryClient.prototype, "getQueryData")
      .mockImplementation(() => [
        {
          id: "thread_1",
          title,
          status: "active",
          createdAt: "2026-07-28T00:00:00.000Z",
          updatedAt: "2026-07-28T00:00:00.000Z",
        },
      ])
    try {
      renderController("New conversation")

      await act(async () => {
        await mocks.chatOptions?.onFinish?.(finishEvent())
        await Promise.resolve()
      })
      expect(invalidate).toHaveBeenCalledTimes(3)

      await act(() => vi.advanceTimersByTimeAsync(500))
      expect(invalidate).toHaveBeenCalledTimes(4)

      title = "Review Issue attachments"
      await act(() => vi.advanceTimersByTimeAsync(20_000))
      expect(invalidate).toHaveBeenCalledTimes(5)
    } finally {
      invalidate.mockRestore()
      getQueryData.mockRestore()
      vi.useRealTimers()
    }
  })
})
