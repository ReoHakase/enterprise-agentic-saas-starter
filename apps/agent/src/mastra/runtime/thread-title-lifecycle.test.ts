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

describe("createThreadTitleLifecycleの契約", () => {
  it("現在のrunでtitleを生成できない場合はmemory処理を省略する", async () => {
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
    ["memoryなし", undefined],
    [
      "既存titleあり",
      {
        getThreadById: () =>
          Promise.resolve({ title: "Review Issue attachments" }),
      },
    ],
  ] as const)("%sではlifecycleを省略する", async (_label, memory) => {
    const { input, pending } = createInput({
      readMemory: createMemoryReader({ memory }),
    })

    await expect(createThreadTitleLifecycle(input)).resolves.toBeUndefined()
    expect(pending).toHaveLength(0)
  })

  it("chatを失敗させずtitle stateのlookup失敗を報告する", async () => {
    const failure = new Error("memory unavailable")
    const { captureFailure, input, pending } = createInput({
      readMemory: createMemoryReader({ error: failure }),
    })

    await expect(createThreadTitleLifecycle(input)).resolves.toBeUndefined()
    expect(captureFailure).toHaveBeenCalledWith("memory_failed")
    expect(pending).toHaveLength(0)
  })

  it("Mastraが永続化を確認するまで空titleを生存させる", async () => {
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

  it("Mastraがtitleを生成しない場合はWorker lifetimeを制限する", async () => {
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
