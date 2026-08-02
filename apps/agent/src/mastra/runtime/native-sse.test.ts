import { afterEach, describe, expect, it, vi } from "vitest"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import {
  scriptedCreateApprovalResumeRuntime,
  scriptedSseExecutionRegistry,
  scriptedSseMastra,
} from "../e2e/scripted-scenarios"
import {
  createNativeChatRequest as chatRequest,
  createNativeControlPlane as createControlPlane,
  createNativeModelRuntime as createModelRuntime,
  nativeRuntimeEnvironment as runtimeEnvironment,
  TEST_RUN_GRANT as GRANT,
} from "../test-support/native-runtime"
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
  stream: unknown,
  memory?: {
    getThreadById(input: {
      threadId: string
    }): Promise<{ title?: string } | undefined>
  }
): AgentRuntimeDependencies["mastra"] =>
  Object.assign(JSON.parse("{}"), {
    getAgentById: () => ({ getMemory: () => memory, stream }),
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

const createReasoningToTextRuntime = () =>
  createModelRuntime([
    {
      parts: [
        { type: "reasoning", text: "reasoning-progress" },
        { type: "text", text: "completed-after-reasoning" },
      ],
      stream: [
        { value: { type: "stream-start", warnings: [] } },
        { value: { type: "reasoning-start", id: "reasoning_1" } },
        {
          delayMs: 20,
          value: {
            type: "reasoning-delta",
            id: "reasoning_1",
            delta: "reasoning-progress",
          },
        },
        { value: { type: "reasoning-end", id: "reasoning_1" } },
        { value: { type: "text-start", id: "text_1" } },
        {
          delayMs: 20,
          value: {
            type: "text-delta",
            id: "text_1",
            delta: "completed-after-reasoning",
          },
        },
        { value: { type: "text-end", id: "text_1" } },
        {
          value: {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                cacheRead: 0,
                cacheWrite: 0,
                noCache: 1,
                total: 1,
              },
              outputTokens: {
                reasoning: 1,
                text: 1,
                total: 2,
              },
            },
          },
        },
      ],
    },
  ])

const assertReasoningToTextCompletes = async () => {
  const { composition, executionRegistry, mastra } =
    createReasoningToTextRuntime()
  const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
    Promise.resolve({ runId: "run_1", status: input.outcome })
  )
  const pending: Promise<unknown>[] = []
  const response = await handleAgentRuntimeRequest(
    chatRequest(),
    runtimeEnvironment,
    { waitUntil: (promise) => pending.push(promise) },
    {
      captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
      createApprovalResumeRuntime: composition.createApprovalResumeRuntime,
      createControlPlane: () => createControlPlane({ finishRun }),
      executionRegistry,
      mastra,
      requireModelCredential: false,
      toControlFailure: () => null,
    }
  )
  const body = await response.text()
  await Promise.all(pending)

  expect(body).toContain("reasoning-progress")
  expect(body).toContain("completed-after-reasoning")
  expect(body).not.toContain("Agent response timed out.")
  expect(finishRun).toHaveBeenCalledWith({
    grant: GRANT,
    outcome: "completed",
  })
}

describe("native runtime SSE privacy", () => {
  it("keeps Mastra title persistence alive without delaying the response stream", async () => {
    let forwardedTitleCallback:
      | ((title: string) => void | Promise<void>)
      | undefined
    const streamFailure = new Error("scripted stream stop")
    const stream = vi.fn<
      (
        messages: unknown,
        options: {
          memory?: {
            onTitleGenerated?: (title: string) => void | Promise<void>
          }
        }
      ) => Promise<never>
    >(
      (
        _messages: unknown,
        options: {
          memory?: {
            onTitleGenerated?: (title: string) => void | Promise<void>
          }
        }
      ) => {
        const onTitleGenerated = options.memory?.onTitleGenerated
        expect(onTitleGenerated).toBeTypeOf("function")
        forwardedTitleCallback = onTitleGenerated
        void onTitleGenerated?.("Review Issue attachments")
        return Promise.reject(streamFailure)
      }
    )
    const mastra = createFakeMastra(stream, {
      getThreadById: () => Promise.resolve({ title: "" }),
    })
    const controlPlane = createControlPlane()
    const startRun = controlPlane.startRun
    controlPlane.startRun = async (input) => ({
      ...(await startRun(input)),
      shouldGenerateTitle: true,
    })
    const pending: Promise<unknown>[] = []

    const response = await handleAgentRuntimeRequest(
      chatRequest(),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      {
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createApprovalResumeRuntime: scriptedCreateApprovalResumeRuntime,
        createControlPlane: () => controlPlane,
        executionRegistry: new ProductAgentExecutionRegistry(),
        mastra,
        requireModelCredential: false,
        toControlFailure: () => null,
      }
    )

    expect(response).toBeInstanceOf(Response)
    await response.text()
    await Promise.all(pending)
    expect(forwardedTitleCallback).toBeTypeOf("function")
  })

  it("reports a provider startup failure to the local raw boundary exactly once", async () => {
    const providerFailure = new Error("MODEL_START_EXACTLY_ONCE")
    const executionRegistry = new ProductAgentExecutionRegistry()
    const stream = vi.fn<() => Promise<never>>(() =>
      Promise.reject(providerFailure)
    )
    const mastra = createFakeMastra(stream)
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const captureFailure = vi.fn<(code: AgentFailureCode) => void>()
    const pending: Promise<unknown>[] = []

    try {
      const response = await handleAgentRuntimeRequest(
        chatRequest(),
        {
          ...runtimeEnvironment,
          DEV_SESSION_ID: "session-1",
          DEV_WORKTREE_ID: "worktree-1",
          NODE_ENV: "development",
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
        },
        { waitUntil: (promise) => pending.push(promise) },
        {
          captureFailure,
          createApprovalResumeRuntime: scriptedCreateApprovalResumeRuntime,
          createControlPlane: () => createControlPlane(),
          executionRegistry,
          mastra,
          requireModelCredential: false,
          toControlFailure: () => null,
        }
      )

      const body = await response.text()
      await Promise.all(pending)
      const rawRecords = consoleError.mock.calls
        .filter(([prefix]) => prefix === "[agent development]")
        .map(([, record]) => record)

      expect(rawRecords).toEqual([
        expect.objectContaining({
          "app.operation": "product-model-start",
          "exception.message": providerFailure.message,
        }),
      ])
      expect(captureFailure).toHaveBeenCalledWith("model_failed")
      expect(body).toContain("Model response failed.")
      expect(body).not.toContain(providerFailure.message)
    } finally {
      consoleError.mockRestore()
    }
  })

  it("emits run identity before provider startup and cancels from the request signal", async () => {
    const executionRegistry = new ProductAgentExecutionRegistry()
    const stream = vi.fn<
      (
        messages: unknown,
        options: {
          abortSignal: AbortSignal
          modelSettings: { maxOutputTokens: number }
        }
      ) => Promise<never>
    >(
      (
        _messages: unknown,
        options: {
          abortSignal: AbortSignal
          modelSettings: { maxOutputTokens: number }
        }
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
      captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
      createApprovalResumeRuntime: scriptedCreateApprovalResumeRuntime,
      createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
      executionRegistry,
      mastra,
      requireModelCredential: false,
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
    expect(body).toContain('"messageMetadata":{"runId":"run_1"}')

    requestController.abort(new DOMException("Stopped by user", "AbortError"))
    body += await readRemaining(reader, decoder)
    await Promise.all(pending)

    expect(cancelRun).toHaveBeenCalledWith({ grant: GRANT })
    expect(stream).toHaveBeenCalledOnce()
    expect(stream.mock.calls[0]?.[1].modelSettings.maxOutputTokens).toBe(4_096)
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
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createApprovalResumeRuntime: composition.createApprovalResumeRuntime,
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
        toControlFailure: () => null,
      }
    )
    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(0)
    requestController.abort(new DOMException("Client stopped", "AbortError"))
    await vi.runAllTimersAsync()
    await bodyPromise
    await Promise.all(pending)

    expect(order).toEqual(["cancel", "release"])
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
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createApprovalResumeRuntime: scriptedCreateApprovalResumeRuntime,
        createControlPlane: () =>
          createControlPlane({
            cancelRun,
            finishRun,
            getAgentImageForModel: () => new Promise(() => undefined),
          }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        toControlFailure: () => null,
      }
    )
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected SSE body")
    const first = await reader.read()
    let body = new TextDecoder().decode(first.value)
    expect(body).toContain('"messageMetadata":{"runId":"run_1"}')

    requestController.abort(new DOMException("Client stopped", "AbortError"))
    body += await readRemaining(reader, new TextDecoder())
    await Promise.all(pending)

    expect(cancelRun).toHaveBeenCalledWith({ grant: GRANT })
    expect(finishRun).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
    expect(body).not.toContain('"type":"error"')
  })

  it("projects a provider stall at the total deadline as a recoverable timeout", async () => {
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
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createApprovalResumeRuntime: scriptedCreateApprovalResumeRuntime,
        createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        toControlFailure: () => null,
      }
    )
    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(270_000)
    const body = await bodyPromise
    await Promise.all(pending)

    expect(body).toContain('"messageMetadata":{"runId":"run_1"}')
    expect(body).toContain("Agent response timed out.")
    expect(body).not.toContain("Model response failed.")
    expect(finishRun).toHaveBeenCalledWith({
      grant: GRANT,
      outcome: "failed",
    })
    expect(cancelRun).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("enforces the 270 second total timeout despite visible reasoning progress", async () => {
    const { composition, executionRegistry, mastra } = createModelRuntime([
      {
        parts: [],
        stream: [
          { value: { type: "stream-start", warnings: [] } },
          { value: { type: "reasoning-start", id: "reasoning_1" } },
          ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
            (index) => ({
              delayMs: 20_000,
              value: {
                type: "reasoning-delta",
                id: "reasoning_1",
                delta: `progress-${index}`,
              },
            })
          ),
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
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createApprovalResumeRuntime: composition.createApprovalResumeRuntime,
        createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
        toControlFailure: () => null,
      }
    )
    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(270_000)
    await vi.advanceTimersByTimeAsync(20_000)
    const body = await bodyPromise
    await Promise.all(pending)

    expect(body).toContain("progress-13")
    expect(body).toContain("Agent response timed out.")
    expect(finishRun).toHaveBeenCalledWith({
      grant: GRANT,
      outcome: "failed",
    })
    expect(cancelRun).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("completes when visible reasoning hands off to text within the total deadline", async () => {
    expect.hasAssertions()
    await assertReasoningToTextCompletes()
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
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createApprovalResumeRuntime: composition.createApprovalResumeRuntime,
        createControlPlane: () => createControlPlane({ cancelRun, finishRun }),
        executionRegistry,
        mastra,
        requireModelCredential: false,
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

  it("redacts provider metadata on the actual SSE response path", async () => {
    const pending: Promise<unknown>[] = []
    const response = await handleAgentRuntimeRequest(
      chatRequest(),
      runtimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      {
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createApprovalResumeRuntime: scriptedCreateApprovalResumeRuntime,
        createControlPlane: () => createControlPlane(),
        executionRegistry: scriptedSseExecutionRegistry,
        mastra: scriptedSseMastra,
        requireModelCredential: false,
        toControlFailure: () => null,
      }
    )
    const body = await response.text()
    await Promise.all(pending)

    expect(body).toContain("SCRIPTED_NATIVE_SSE_OK")
    expect(body).toContain('"messageMetadata":{"runId":"run_1"}')
    expect(body.indexOf('"messageMetadata":{"runId":"run_1"}')).toBeLessThan(
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
