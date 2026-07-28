import { describe, expect, it, vi } from "vitest"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import {
  CountingExecutionRegistry,
  createNativeChatRequest,
  createNativeControlPlane,
  createNativeModelRuntime,
  nativeRuntimeEnvironment,
  TEST_RUN_GRANT,
} from "../test-support/native-runtime"
import { memoryCommitWorkflowRunId } from "../workflows/memory-commit/workflow-contract"
import type { AgentControlPlanePort } from "./ports"
import {
  handleAgentRuntimeRequest,
  type AgentRuntimeDependencies,
} from "./run-agent"

const occurrences = (value: string, token: string) =>
  value.split(token).length - 1

const readUntil = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  token: string,
  body = "",
  decoder = new TextDecoder()
): Promise<{ body: string; decoder: TextDecoder }> => {
  if (body.includes(token)) return { body, decoder }
  const next = await reader.read()
  if (next.done) throw new Error(`Native stream ended before ${token}`)
  return readUntil(
    reader,
    token,
    body + decoder.decode(next.value, { stream: true }),
    decoder
  )
}

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

const createDependencies = (
  runtime: ReturnType<typeof createNativeModelRuntime>,
  lifecycle: Partial<AgentControlPlanePort>,
  captureFailure: (code: AgentFailureCode) => void
): AgentRuntimeDependencies => ({
  captureFailure,
  createApprovalResumeRuntime: runtime.composition.createApprovalResumeRuntime,
  createControlPlane: () => createNativeControlPlane(lifecycle),
  executionRegistry: runtime.executionRegistry,
  mastra: runtime.mastra,
  requireModelCredential: false,
  threadTitleAgent: runtime.composition.threadTitleAgent,
  toControlFailure: () => null,
})

describe("native runtime recovery", () => {
  it("keeps a throwing server tool local to one bounded tool error and accepts the next turn", async () => {
    const executionRegistry = new CountingExecutionRegistry()
    const runtime = createNativeModelRuntime(
      [
        {
          finishReason: "tool-calls",
          parts: [
            {
              type: "tool-call",
              input: { query: "public deterministic failure" },
              toolCallId: "throwing-server-tool",
              toolName: "web_search",
            },
          ],
        },
        {
          parts: [{ type: "text", text: "RECOVERED_AFTER_TOOL_ERROR" }],
        },
        {
          parts: [{ type: "text", text: "SECOND_TURN_SUCCEEDED" }],
        },
      ],
      executionRegistry,
      async () => {
        throw new Error("PRIVATE_SERVER_TOOL_FAILURE")
      }
    )
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(() =>
      Promise.resolve({ runId: "run_1", status: "canceled" })
    )
    const captureFailure = vi.fn<(code: AgentFailureCode) => void>()
    const pending: Promise<unknown>[] = []
    const settleMemoryCommit = vi.fn<
      AgentControlPlanePort["settleMemoryCommit"]
    >(async (input) => {
      await expect(
        runtime.mastra
          .getWorkflow("memoryCommitWorkflow")
          .getWorkflowRunById(memoryCommitWorkflowRunId(input.applicationRunId))
      ).resolves.toMatchObject({ status: "success" })
      await finishRun({ grant: TEST_RUN_GRANT, outcome: "completed" })
      return {
        acknowledged: true,
        applicationRunId: input.applicationRunId,
      }
    })
    const dependencies = createDependencies(
      runtime,
      { cancelRun, settleMemoryCommit, finishRun },
      captureFailure
    )

    const first = await handleAgentRuntimeRequest(
      createNativeChatRequest(
        undefined,
        [],
        "throwing-tool-message",
        "Search the public Web"
      ),
      nativeRuntimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      dependencies
    )
    const firstBody = await first.text()
    await Promise.all(pending.splice(0))

    expect(occurrences(firstBody, '"type":"tool-output-error"')).toBe(1)
    expect(firstBody).toContain('"errorText":"Model response failed."')
    expect(firstBody).toContain("RECOVERED_AFTER_TOOL_ERROR")
    expect(firstBody).not.toContain("PRIVATE_SERVER_TOOL_FAILURE")
    expect(firstBody).not.toContain('"type":"error"')
    expect(captureFailure).not.toHaveBeenCalled()
    expect(cancelRun).not.toHaveBeenCalled()
    expect(finishRun).toHaveBeenCalledOnce()
    expect(settleMemoryCommit).toHaveBeenCalledOnce()
    expect(finishRun).toHaveBeenLastCalledWith({
      grant: TEST_RUN_GRANT,
      outcome: "completed",
    })
    expect(executionRegistry.releases).toBe(1)

    const second = await handleAgentRuntimeRequest(
      createNativeChatRequest(
        undefined,
        [],
        "message-after-tool-error",
        "Continue in the same thread"
      ),
      nativeRuntimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      dependencies
    )
    const secondBody = await second.text()
    await Promise.all(pending.splice(0))

    expect(secondBody).toContain("SECOND_TURN_SUCCEEDED")
    expect(finishRun).toHaveBeenCalledTimes(2)
    expect(executionRegistry.releases).toBe(2)
  })

  it("settles simultaneous request and explicit cancellation once behind a deferred barrier", async () => {
    const executionRegistry = new CountingExecutionRegistry()
    const runtime = createNativeModelRuntime(
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
                delta: "partial-before-stop",
              },
            },
            {
              delayMs: 60_000,
              value: { type: "text-end", id: "text_1" },
            },
          ],
        },
        {
          parts: [{ type: "text", text: "NEXT_TURN_SUCCEEDED" }],
        },
      ],
      executionRegistry
    )
    const cancelBarrier = Promise.withResolvers<void>()
    const cancelEntered = Promise.withResolvers<void>()
    const cancelRun = vi.fn<AgentControlPlanePort["cancelRun"]>(async () => {
      cancelEntered.resolve()
      await cancelBarrier.promise
      return { runId: "run_1", status: "canceled" }
    })
    const finishRun = vi.fn<AgentControlPlanePort["finishRun"]>((input) =>
      Promise.resolve({ runId: "run_1", status: input.outcome })
    )
    const recordUsage = vi.fn<AgentControlPlanePort["recordUsage"]>(() =>
      Promise.resolve({
        calculatedCostMicros: 0,
        pricingVersion: "unpriced",
        recorded: true,
      })
    )
    const pending: Promise<unknown>[] = []
    const dependencies = createDependencies(
      runtime,
      { cancelRun, finishRun, recordUsage },
      vi.fn<(code: AgentFailureCode) => void>()
    )
    const requestController = new AbortController()
    const response = await handleAgentRuntimeRequest(
      createNativeChatRequest(requestController.signal),
      nativeRuntimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      dependencies
    )
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Expected native response body")
    const partial = await readUntil(reader, "partial-before-stop")

    requestController.abort(new DOMException("Client stopped", "AbortError"))
    const explicitCancel = await handleAgentRuntimeRequest(
      new Request("https://agent.internal/runs/run_1/cancel", {
        method: "POST",
      }),
      nativeRuntimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      dependencies
    )
    await cancelEntered.promise

    expect(requestController.signal.aborted).toBe(true)
    expect(explicitCancel.status).toBe(204)
    expect(cancelRun).toHaveBeenCalledOnce()
    expect(recordUsage).not.toHaveBeenCalled()
    expect(executionRegistry.releases).toBe(0)

    cancelBarrier.resolve()
    const body = partial.body + (await readRemaining(reader, partial.decoder))
    await Promise.all(pending.splice(0))

    expect(cancelRun).toHaveBeenCalledOnce()
    expect(recordUsage).toHaveBeenCalledOnce()
    expect(finishRun).not.toHaveBeenCalled()
    expect(executionRegistry.releases).toBe(1)
    expect(occurrences(body, '"type":"abort"')).toBe(1)
    expect(body).not.toContain('"type":"error"')

    const nextTurn = await handleAgentRuntimeRequest(
      createNativeChatRequest(undefined, [], "message-after-cancel"),
      nativeRuntimeEnvironment,
      { waitUntil: (promise) => pending.push(promise) },
      dependencies
    )
    const nextBody = await nextTurn.text()
    await Promise.all(pending.splice(0))

    expect(nextBody).toContain("NEXT_TURN_SUCCEEDED")
    expect(finishRun).toHaveBeenCalledOnce()
    expect(executionRegistry.releases).toBe(2)
  })
})
