import { afterEach, describe, expect, it, vi } from "vitest"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import {
  scriptedApprovedIssueActionExecutionRegistry,
  scriptedSseExecutionRegistry,
  scriptedSseMastra,
  scriptedThreadTitleAgent,
} from "../e2e/scripted-scenarios"
import {
  createNativeChatRequest as chatRequest,
  createNativeControlPlane as createControlPlane,
  createNativeModelRuntime as createModelRuntime,
  nativeRuntimeEnvironment as runtimeEnvironment,
  TEST_RUN_GRANT as GRANT,
} from "../test-support/native-runtime"
import { hasPendingMemoryCommit } from "../workflows/memory-commit"
import type { AgentControlPlanePort } from "./ports"
import { ProductAgentExecutionRegistry } from "./request-context"
import {
  handleAgentRuntimeRequest,
  type AgentRuntimeDependencies,
} from "./run-agent"

afterEach(() => {
  vi.useRealTimers()
})

const createFakeMastra = (
  stream: unknown
): AgentRuntimeDependencies["mastra"] =>
  Object.assign(JSON.parse("{}"), {
    getAgentById: () => ({ getMemory: () => undefined, stream }),
    getWorkflow: () => ({
      listWorkflowRuns: () => Promise.resolve({ runs: [], total: 0 }),
    }),
  })

const readRemaining = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  body = ""
): Promise<string> => {
  const next = await reader.read()
  if (next.done) return body + decoder.decode()
  return readRemaining(
    reader,
    decoder,
    body + decoder.decode(next.value, { stream: true })
  )
}

describe("native runtime SSE privacy", () => {
  it("emits run identity before provider startup and cancels through the private run endpoint", async () => {
    const executionRegistry = new ProductAgentExecutionRegistry()
    const stream = vi.fn<
      (
        messages: unknown,
        options: { abortSignal: AbortSignal }
      ) => Promise<never>
    >(
      (
        _messages: unknown,
        options: { abortSignal: AbortSignal }
      ): Promise<never> =>
        new Promise((_resolve, reject) => {
          const abort = () => reject(options.abortSignal.reason)
          options.abortSignal.addEventListener("abort", abort, { once: true })
          if (options.abortSignal.aborted) abort()
        })
    )
    const mastra = createFakeMastra(stream)
    const requestController = new AbortController()
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(() =>
      Promise.resolve({ runId: "run_1", status: "canceled" })
    )
    const pending: Promise<unknown>[] = []
    const dependencies = {
      approvedIssueActionExecutionRegistry:
        scriptedApprovedIssueActionExecutionRegistry,
      captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
      createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
      executionRegistry,
      mastra,
      requireModelCredential: false,
      threadTitleAgent: scriptedThreadTitleAgent,
      toControlFailure: () => null,
    }
    const response = await handleAgentRuntimeRequest(
      chatRequest(requestController.signal),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      dependencies
    )
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected SSE body")
    const first = await reader.read()
    const decoder = new TextDecoder()
    let body = decoder.decode(first.value)
    expect(body).toContain('"type":"data-run"')

    const canceled = await handleAgentRuntimeRequest(
      new Request("https://agent.internal/runs/run_1/cancel", {
        method: "POST",
      }),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      dependencies
    )
    expect(canceled.status).toBe(204)
    body += await readRemaining(reader, decoder)
    await Promise.all(pending)

    expect(cancelRun).toHaveBeenCalledWith({ grant: GRANT })
    expect(stream).toHaveBeenCalledOnce()
    expect(finishRun).not.toHaveBeenCalled()
    expect(body).not.toContain('"type":"error"')
    expect(body).not.toContain("Model response failed")
  })

  it("settles an observed abort before usage and releases its execution last", async () => {
    vi.useFakeTimers()
    const order: string[] = []
    class OrderedExecutionRegistry extends ProductAgentExecutionRegistry {
      override register(
        input: Parameters<ProductAgentExecutionRegistry["register"]>[0]
      ) {
        const registration = super.register(input)
        return {
          ...registration,
          release: () => {
            order.push("release")
            registration.release()
          },
        }
      }
    }
    const executionRegistry = new OrderedExecutionRegistry()
    const { composition, mastra } = createModelRuntime(
      [
        {
          parts: [],
          stream: [
            { value: { type: "stream-start", warnings: [] } },
            { value: { type: "text-start", id: "text_1" } },
            {
              value: {
                type: "text-delta",
                id: "text_1",
                delta: "partial",
              },
            },
            {
              delayMs: 60_000,
              value: { type: "text-end", id: "text_1" },
            },
          ],
        },
      ],
      executionRegistry
    )
    const requestController = new AbortController()
    const pending: Promise<unknown>[] = []
    const response = await handleAgentRuntimeRequest(
      chatRequest(requestController.signal),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      {
        approvedIssueActionExecutionRegistry:
          composition.approvedIssueActionExecutionRegistry,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createControlPlane: () =>
          createControlPlane({
            cancelRun: async () => {
              order.push("cancel")
              return { runId: "run_1", status: "canceled" }
            },
            recordUsage: async () => {
              order.push("usage")
              return {
                calculatedCostMicros: 0,
                pricingVersion: "unpriced",
                recorded: true,
              }
            },
          }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        threadTitleAgent: composition.threadTitleAgent,
        toControlFailure: () => null,
      }
    )
    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(0)
    requestController.abort(new DOMException("Client stopped", "AbortError"))
    await vi.runAllTimersAsync()
    await bodyPromise
    await Promise.all(pending)

    expect(order).toEqual(["cancel", "usage", "release"])
  })

  it("bounds image-loading stalls behind the already-emitted run identity", async () => {
    const executionRegistry = new ProductAgentExecutionRegistry()
    const stream = vi.fn<() => void>()
    const mastra = createFakeMastra(stream)
    const requestController = new AbortController()
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(() =>
      Promise.resolve({ runId: "run_1", status: "canceled" })
    )
    const pending: Promise<unknown>[] = []
    const response = await handleAgentRuntimeRequest(
      chatRequest(requestController.signal, ["asset_1"]),
      { ...runtimeEnvironment, AGENT_VISION_ENABLED: "1" },
      { waitUntil: (promise) => pending.push(promise) },
      {
        approvedIssueActionExecutionRegistry:
          scriptedApprovedIssueActionExecutionRegistry,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createControlPlane: () =>
          createControlPlane({
            cancelRun,
            finishRun,
            getAgentImageForModel: () => new Promise(() => undefined),
          }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        threadTitleAgent: scriptedThreadTitleAgent,
        toControlFailure: () => null,
      }
    )
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected SSE body")
    const first = await reader.read()
    let body = new TextDecoder().decode(first.value)
    expect(body).toContain('"type":"data-run"')

    requestController.abort(new DOMException("Client stopped", "AbortError"))
    body += await readRemaining(reader, new TextDecoder())
    await Promise.all(pending)

    expect(cancelRun).toHaveBeenCalledWith({ grant: GRANT })
    expect(finishRun).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
    expect(body).not.toContain('"type":"error"')
  })

  it("projects a pre-output provider stall as a recoverable timeout", async () => {
    const executionRegistry = new ProductAgentExecutionRegistry()
    const stream = vi.fn<() => Promise<never>>(
      () => new Promise(() => undefined)
    )
    const mastra = createFakeMastra(stream)
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(() =>
      Promise.resolve({ runId: "run_1", status: "canceled" })
    )
    const pending: Promise<unknown>[] = []
    vi.useFakeTimers()
    const response = await handleAgentRuntimeRequest(
      chatRequest(),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      {
        approvedIssueActionExecutionRegistry:
          scriptedApprovedIssueActionExecutionRegistry,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        threadTitleAgent: scriptedThreadTitleAgent,
        toControlFailure: () => null,
      }
    )
    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(30_000)
    const body = await bodyPromise
    await Promise.all(pending)

    expect(body).toContain('"type":"data-run"')
    expect(body).toContain("Agent response timed out.")
    expect(body).not.toContain("Model response failed.")
    expect(finishRun).toHaveBeenCalledWith({
      grant: GRANT,
      outcome: "failed",
    })
    expect(cancelRun).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("enforces the immutable 90 second total timeout despite useful progress", async () => {
    const { composition, executionRegistry, mastra } = createModelRuntime([
      {
        parts: [],
        stream: [
          { value: { type: "stream-start", warnings: [] } },
          { value: { type: "text-start", id: "text_1" } },
          ...[1, 2, 3, 4, 5].map((index) => ({
            delayMs: 20_000,
            value: {
              type: "text-delta",
              id: "text_1",
              delta: `progress-${index}`,
            },
          })),
        ],
      },
    ])
    vi.useFakeTimers()
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(() =>
      Promise.resolve({ runId: "run_1", status: "canceled" })
    )
    const pending: Promise<unknown>[] = []
    const response = await handleAgentRuntimeRequest(
      chatRequest(),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      {
        approvedIssueActionExecutionRegistry:
          composition.approvedIssueActionExecutionRegistry,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        threadTitleAgent: composition.threadTitleAgent,
        toControlFailure: () => null,
      }
    )
    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(90_000)
    await vi.advanceTimersByTimeAsync(10_000)
    const body = await bodyPromise
    await Promise.all(pending)

    expect(body).toContain("progress-4")
    expect(body).toContain("Agent response timed out.")
    expect(finishRun).toHaveBeenCalledWith({
      grant: GRANT,
      outcome: "failed",
    })
    expect(cancelRun).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps the first useful-output timeout cause when the request abort follows", async () => {
    vi.useFakeTimers()
    const { composition, executionRegistry, mastra } = createModelRuntime([
      {
        parts: [],
        stream: [
          {
            delayMs: 31_000,
            value: { type: "stream-start", warnings: [] },
          },
        ],
      },
    ])
    const requestController = new AbortController()
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(() =>
      Promise.resolve({ runId: "run_1", status: "canceled" })
    )
    const pending: Promise<unknown>[] = []

    try {
      const response = await handleAgentRuntimeRequest(
        chatRequest(requestController.signal),
        runtimeEnvironment,
        { waitUntil: (promise) => pending.push(promise) },
        {
          approvedIssueActionExecutionRegistry:
            composition.approvedIssueActionExecutionRegistry,
          captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
          createControlPlane: () =>
            createControlPlane({ cancelRun, finishRun }),
          executionRegistry,
          mastra,
          requireModelCredential: false,
          threadTitleAgent: composition.threadTitleAgent,
          toControlFailure: () => null,
        }
      )
      const bodyPromise = response.text()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(30_000)
      requestController.abort(new DOMException("Client stopped", "AbortError"))
      await vi.advanceTimersByTimeAsync(1_000)
      const body = await bodyPromise
      await Promise.all(pending)

      expect(body).toContain("Agent response timed out.")
      expect(finishRun).toHaveBeenCalledWith({
        grant: GRANT,
        outcome: "failed",
      })
      expect(cancelRun).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("settles an earlier user abort as cancel even when the provider reports an error", async () => {
    const { composition, executionRegistry, mastra } = createModelRuntime([
      {
        parts: [],
        stream: [
          {
            delayMs: 31_000,
            value: { type: "stream-start", warnings: [] },
          },
        ],
      },
    ])
    vi.useFakeTimers()
    const requestController = new AbortController()
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(() =>
      Promise.resolve({ runId: "run_1", status: "canceled" })
    )
    const pending: Promise<unknown>[] = []
    const response = await handleAgentRuntimeRequest(
      chatRequest(requestController.signal),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      {
        approvedIssueActionExecutionRegistry:
          composition.approvedIssueActionExecutionRegistry,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        threadTitleAgent: composition.threadTitleAgent,
        toControlFailure: () => null,
      }
    )
    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(0)
    requestController.abort(new DOMException("Client stopped", "AbortError"))
    await vi.advanceTimersByTimeAsync(31_000)
    const body = await bodyPromise
    await Promise.all(pending)

    expect(body).not.toContain("Agent response timed out.")
    expect(cancelRun).toHaveBeenCalledWith({ grant: GRANT })
    expect(finishRun).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("fails the native stream after bounded settlement retries while preserving the Mastra journal", async () => {
    const { composition, executionRegistry, mastra } = createModelRuntime([
      {
        parts: [{ type: "text", text: "PERSIST_BEFORE_SUCCESS" }],
      },
    ])
    const settleMemoryCommit = vi
      .fn<AgentControlPlanePort["settleMemoryCommit"]>()
      .mockRejectedValue(new Error("application settlement unavailable"))
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const captureFailure = vi.fn<(code: AgentFailureCode) => void>()
    const pending: Promise<unknown>[] = []

    try {
      const response = await handleAgentRuntimeRequest(
        chatRequest(),
        runtimeEnvironment,
        { waitUntil: (promise) => pending.push(promise) },
        {
          approvedIssueActionExecutionRegistry:
            composition.approvedIssueActionExecutionRegistry,
          captureFailure,
          createControlPlane: () =>
            createControlPlane({ finishRun, settleMemoryCommit }),
          executionRegistry,
          mastra,
          requireModelCredential: false,
          threadTitleAgent: composition.threadTitleAgent,
          toControlFailure: () => null,
        }
      )

      await expect(response.text()).rejects.toThrow(
        "Agent response persistence is deferred"
      )
      await Promise.all(pending)

      expect(settleMemoryCommit).toHaveBeenCalledTimes(4)
      expect(finishRun).not.toHaveBeenCalled()
      expect(captureFailure).toHaveBeenCalledWith("memory_commit_deferred")
      expect(captureFailure).not.toHaveBeenCalledWith("model_failed")
      await expect(hasPendingMemoryCommit(mastra, "thread_1")).resolves.toBe(
        true
      )
    } finally {
      await composition.storage.close()
    }
  })

  it("redacts provider metadata on the actual SSE response path", async () => {
    const pending: Promise<unknown>[] = []
    const response = await handleAgentRuntimeRequest(
      chatRequest(),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      {
        approvedIssueActionExecutionRegistry:
          scriptedApprovedIssueActionExecutionRegistry,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createControlPlane: () => createControlPlane(),
        executionRegistry: scriptedSseExecutionRegistry,
        mastra: scriptedSseMastra,
        requireModelCredential: false,
        threadTitleAgent: scriptedThreadTitleAgent,
        toControlFailure: () => null,
      }
    )
    const body = await response.text()
    await Promise.all(pending)

    expect(body).toContain("SCRIPTED_NATIVE_SSE_OK")
    expect(body).toContain('"type":"data-run"')
    expect(body).toContain('"runId":"run_1"')
    expect(body).toContain('"transient":true')
    expect(body.indexOf('"type":"data-run"')).toBeLessThan(
      body.indexOf("SCRIPTED_NATIVE_SSE_OK")
    )
    expect(response.status).toBe(200)
    expect(body).not.toContain("PRIVATE_PROVIDER_METADATA_SENTINEL")
    expect(body).not.toContain("providerMetadata")
    expect(body).not.toContain("callProviderMetadata")
    expect(body).not.toContain("resultProviderMetadata")
    expect(body).not.toContain("toolMetadata")
  })
})
