import type { AgentRuntimeChatInput } from "@enterprise-agentic-saas/agent-contracts"
import { Memory } from "@mastra/memory"

const RUN_TIMEOUT_MS = 90_000
const USEFUL_OUTPUT_TIMEOUT_MS = 30_000
const noop = () => undefined

export type AbortCause = "revoked" | "total_timeout" | "useful_timeout" | "user"

const activeRunAbortControllers = new Map<
  string,
  (reason: DOMException) => void
>()

export const cancelActiveRun = (runId: string) => {
  activeRunAbortControllers.get(runId)?.(
    new DOMException("Stopped by user", "AbortError")
  )
}

export const createRunAbortLifecycle = (request: Request, runId: string) => {
  const controller = new AbortController()
  let cause: AbortCause | undefined
  let closed = false
  const abortFrom = (nextCause: AbortCause, reason: unknown) => {
    if (closed || cause) return
    cause = nextCause
    controller.abort(reason)
  }
  activeRunAbortControllers.set(runId, (reason) => abortFrom("user", reason))
  const onRequestAbort = () =>
    abortFrom(
      "user",
      request.signal.reason ?? new DOMException("Aborted", "AbortError")
    )
  request.signal.addEventListener("abort", onRequestAbort, { once: true })
  if (request.signal.aborted) onRequestAbort()
  const totalTimeoutTimer = setTimeout(
    () =>
      abortFrom(
        "total_timeout",
        new DOMException("Agent run timed out", "TimeoutError")
      ),
    RUN_TIMEOUT_MS
  )
  let usefulOutputTimer = setTimeout(
    () =>
      abortFrom(
        "useful_timeout",
        new DOMException("Agent useful output timed out", "TimeoutError")
      ),
    USEFUL_OUTPUT_TIMEOUT_MS
  )
  const resetUsefulOutputTimer = () => {
    if (closed || cause) return
    clearTimeout(usefulOutputTimer)
    usefulOutputTimer = setTimeout(
      () =>
        abortFrom(
          "useful_timeout",
          new DOMException("Agent useful output timed out", "TimeoutError")
        ),
      USEFUL_OUTPUT_TIMEOUT_MS
    )
  }
  const close = () => {
    if (closed) return
    closed = true
    activeRunAbortControllers.delete(runId)
    clearTimeout(totalTimeoutTimer)
    clearTimeout(usefulOutputTimer)
    request.signal.removeEventListener("abort", onRequestAbort)
  }
  return {
    abortFrom,
    close,
    getCause: () => cause,
    resetUsefulOutputTimer,
    signal: controller.signal,
  }
}

type MemoryAgent = {
  getMemory(): unknown
}

export const createStoppedMessagePersistence =
  ({
    input,
    memoryResourceId,
    productAgent,
  }: {
    input: AgentRuntimeChatInput
    memoryResourceId: string
    productAgent: MemoryAgent
  }) =>
  async () => {
    if (input.message.role !== "user") return
    const memory = await productAgent.getMemory()
    if (!(memory instanceof Memory)) return
    const thread = await memory.getThreadById({
      resourceId: memoryResourceId,
      threadId: input.threadId,
    })
    if (thread) {
      const existing = await memory.recall({
        page: 0,
        perPage: false,
        resourceId: memoryResourceId,
        threadId: input.threadId,
      })
      if (
        existing.messages.some((message) => message.id === input.message.id)
      ) {
        return
      }
    }
    const now = new Date()
    if (!thread) {
      await memory.saveThread({
        thread: {
          id: input.threadId,
          resourceId: memoryResourceId,
          createdAt: now,
          updatedAt: now,
          title: "New conversation",
          metadata: {},
        },
      })
    }
    await memory.saveMessages({
      messages: [
        {
          id: input.message.id,
          role: "user",
          createdAt: now,
          resourceId: memoryResourceId,
          threadId: input.threadId,
          content: {
            format: 2,
            parts: JSON.parse(JSON.stringify(input.message.parts)),
          },
        },
      ],
    })
  }

export const waitForAbortable = async <Value>(
  operation: Promise<Value>,
  signal: AbortSignal
): Promise<Value> => {
  signal.throwIfAborted()
  let onAbort: () => void = noop
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
  })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    signal.removeEventListener("abort", onAbort)
  }
}
