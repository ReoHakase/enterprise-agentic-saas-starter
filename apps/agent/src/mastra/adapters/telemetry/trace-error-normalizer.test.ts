import { SpanType, type AnySpan } from "@mastra/core/observability"
import { describe, expect, it } from "vitest"

import { AgentTraceErrorNormalizer } from "./trace-error-normalizer"

const createSpan = (input: {
  attributes?: AnySpan["attributes"]
  entityName?: string
  errorInfo: NonNullable<AnySpan["errorInfo"]>
  input?: unknown
  name?: string
  output?: unknown
  type: SpanType
}): AnySpan =>
  Object.assign(Object.create(null), {
    id: "span-1",
    isEvent: false,
    isInternal: false,
    name: "failed operation",
    startTime: new Date("2026-08-01T00:00:00.000Z"),
    traceId: "0123456789abcdef0123456789abcdef",
    ...input,
  })

describe("AgentTraceErrorNormalizerの契約", () => {
  it("inputとoutputを保ちながらraw errorInfoを置換する", () => {
    const span = createSpan({
      attributes: { model: "kept-model" },
      errorInfo: {
        id: "provider-secret-id",
        message: "provider raw response",
        name: "ProviderError",
        stack: "private stack",
      },
      input: { prompt: "kept input" },
      output: { result: "kept output" },
      type: SpanType.MODEL_INFERENCE,
    })

    const result = new AgentTraceErrorNormalizer().process(span)

    expect(result?.errorInfo).toEqual({
      id: "agent_runtime_error",
      message: "Agent operation failed",
      name: "Error",
    })
    expect(result?.attributes).toMatchObject({
      model: "kept-model",
      "app.error.code": "model_failed",
    })
    expect(result?.input).toEqual({ prompt: "kept input" })
    expect(result?.output).toEqual({ result: "kept output" })
    expect(JSON.stringify(result)).not.toMatch(
      /provider raw response|private stack|provider-secret-id/u
    )
  })

  it.each([
    [SpanType.MODEL_GENERATION, "model_failed"],
    [SpanType.TOOL_CALL, "tool_failed"],
    [SpanType.MEMORY_OPERATION, "memory_failed"],
    [SpanType.PROCESSOR_RUN, "processor_failed"],
    [SpanType.WORKFLOW_STEP, "workflow_failed"],
  ])("%s operation codeを使う", (type, code) => {
    const span = createSpan({
      attributes: {},
      errorInfo: { message: "raw" },
      name: "failed operation",
      type,
    })

    expect(new AgentTraceErrorNormalizer().process(span)?.attributes).toEqual({
      "app.error.code": code,
    })
  })

  it.each(["run_settlement_failed", "resume_storage_close_failed"])(
    "既存の固定error code %sを保持する",
    (code) => {
      const span = createSpan({
        attributes: {},
        errorInfo: { message: "raw" },
        name: "model generation",
        type: SpanType.MODEL_GENERATION,
      })
      Reflect.set(span.attributes ?? {}, "app.error.code", code)

      expect(new AgentTraceErrorNormalizer().process(span)?.attributes).toEqual(
        {
          "app.error.code": code,
        }
      )
    }
  )

  it("未登録provider error codeを保持しない", () => {
    const span = createSpan({
      attributes: {},
      errorInfo: { message: "raw" },
      name: "model generation",
      type: SpanType.MODEL_GENERATION,
    })
    Reflect.set(
      span.attributes ?? {},
      "app.error.code",
      "provider-private-code"
    )

    expect(new AgentTraceErrorNormalizer().process(span)?.attributes).toEqual({
      "app.error.code": "model_failed",
    })
  })

  it("汎用storage spanをmodel error扱いせず分類する", () => {
    const span = createSpan({
      attributes: {},
      entityName: "LibSQL storage",
      errorInfo: { message: "raw" },
      name: "storage init",
      type: SpanType.GENERIC,
    })

    expect(new AgentTraceErrorNormalizer().process(span)?.attributes).toEqual({
      "app.error.code": "storage_failed",
    })
  })
})
