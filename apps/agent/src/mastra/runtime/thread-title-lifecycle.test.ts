import { afterEach, describe, expect, it, vi } from "vitest"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import { createThreadTitleLifecycle } from "./thread-title-lifecycle"

const environment = { NODE_ENV: "test" } as const

const createMemoryReader =
  ({
    memory,
    error,
  }: {
    memory?: {
      getThreadById(input: {
        threadId: string
      }): Promise<{ title?: string } | undefined>
    }
    error?: Error
  }) =>
  () =>
    error ? Promise.reject(error) : Promise.resolve(memory)

const createInput = ({
  readMemory,
  shouldGenerateTitle = true,
}: {
  readMemory: ReturnType<typeof createMemoryReader>
  shouldGenerateTitle?: boolean
}) => {
  const captureFailure = vi.fn<(code: AgentFailureCode) => void>()
  const pending: Promise<unknown>[] = []
  return {
    captureFailure,
    input: {
      captureFailure,
      context: {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      },
      environment,
      readMemory,
      shouldGenerateTitle,
      threadId: "thread_1",
    },
    pending,
  }
}

afterEach(() => vi.useRealTimers())

describe("createThreadTitleLifecycle", () => {
  it("skips memory work when this run cannot generate a title", async () => {
    const getThreadById = vi.fn<() => Promise<undefined>>()
    const { input, pending } = createInput({
      readMemory: createMemoryReader({ memory: { getThreadById } }),
      shouldGenerateTitle: false,
    })

    await expect(createThreadTitleLifecycle(input)).resolves.toBeUndefined()
    expect(getThreadById).not.toHaveBeenCalled()
    expect(pending).toHaveLength(0)
  })

  it.each([
    ["without memory", undefined],
    [
      "with an existing title",
      {
        getThreadById: () =>
          Promise.resolve({ title: "Review Issue attachments" }),
      },
    ],
  ] as const)("skips the lifecycle %s", async (_label, memory) => {
    const { input, pending } = createInput({
      readMemory: createMemoryReader({ memory }),
    })

    await expect(createThreadTitleLifecycle(input)).resolves.toBeUndefined()
    expect(pending).toHaveLength(0)
  })

  it("reports a title-state lookup failure without failing the chat", async () => {
    const failure = new Error("memory unavailable")
    const { captureFailure, input, pending } = createInput({
      readMemory: createMemoryReader({ error: failure }),
    })

    await expect(createThreadTitleLifecycle(input)).resolves.toBeUndefined()
    expect(captureFailure).toHaveBeenCalledWith("memory_failed")
    expect(pending).toHaveLength(0)
  })

  it("keeps a blank title alive until Mastra confirms persistence", async () => {
    const { input, pending } = createInput({
      readMemory: createMemoryReader({
        memory: { getThreadById: () => Promise.resolve({ title: "" }) },
      }),
    })

    const lifecycle = await createThreadTitleLifecycle(input)
    expect(lifecycle).toBeDefined()
    expect(pending).toHaveLength(1)

    lifecycle?.onTitleGenerated()
    await expect(Promise.all(pending)).resolves.toEqual([undefined])
  })

  it("bounds the Worker lifetime when Mastra never generates a title", async () => {
    vi.useFakeTimers()
    const { input, pending } = createInput({
      readMemory: createMemoryReader({
        memory: { getThreadById: () => Promise.resolve(undefined) },
      }),
    })

    const lifecycle = await createThreadTitleLifecycle(input)
    expect(lifecycle).toBeDefined()
    expect(pending).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(30_000)
    await expect(Promise.all(pending)).resolves.toEqual([undefined])
    lifecycle?.settle()
  })
})
