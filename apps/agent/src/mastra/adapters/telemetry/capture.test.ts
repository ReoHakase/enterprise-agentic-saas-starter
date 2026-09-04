import { beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => ({
  emit: vi.fn<(record: unknown) => void>(),
  setAttribute: vi.fn<(name: string, value: unknown) => void>(),
  setStatus: vi.fn<(status: unknown) => void>(),
  spanContext: vi.fn<() => { spanId: string; traceId: string }>(() => ({
    spanId: "span-1",
    traceId: "trace-1",
  })),
}))

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { ERROR: 2 },
  trace: {
    getActiveSpan: () => ({
      setAttribute: telemetry.setAttribute,
      setStatus: telemetry.setStatus,
      spanContext: telemetry.spanContext,
    }),
  },
}))

vi.mock("@opentelemetry/api-logs", () => ({
  SeverityNumber: { ERROR: 17 },
  logs: { getLogger: () => ({ emit: telemetry.emit }) },
}))

import { createAgentFailureCapture } from "./capture"

const local = {
  DEV_SESSION_ID: "session-1",
  DEV_WORKTREE_ID: "worktree-1",
  NODE_ENV: "development",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Agent失敗capture", () => {
  it("traceからraw dataを除外して固定local logを関連付ける", () => {
    createAgentFailureCapture(local)("model_failed")

    expect(telemetry.setAttribute).toHaveBeenCalledWith(
      "app.error.code",
      "model_failed"
    )
    expect(telemetry.setStatus).toHaveBeenCalledWith({ code: 2 })
    expect(telemetry.emit).toHaveBeenCalledWith({
      attributes: expect.objectContaining({
        "app.error.code": "model_failed",
        "app.operation": "agent.runtime",
        "app.outcome": "failure",
        "event.name": "agent.runtime.failed",
        "logger.scope": "runtime.failure",
        span_id: "span-1",
        trace_id: "trace-1",
      }),
      body: "Agent model response failed",
      severityNumber: 17,
      severityText: "ERROR",
    })
  })

  it("固定codeだけでresume storage cleanupを観測する", () => {
    createAgentFailureCapture(local)("resume_storage_close_failed")

    expect(telemetry.setAttribute).toHaveBeenCalledWith(
      "app.error.code",
      "resume_storage_close_failed"
    )
    expect(telemetry.emit).toHaveBeenCalledWith({
      attributes: expect.objectContaining({
        "app.error.code": "resume_storage_close_failed",
        "app.operation": "agent.runtime",
        "app.outcome": "failure",
        "event.name": "agent.runtime.failed",
      }),
      body: "Agent resume storage cleanup failed",
      severityNumber: 17,
      severityText: "ERROR",
    })
    expect(JSON.stringify(telemetry.emit.mock.calls)).not.toContain(
      "private storage"
    )
  })

  it("spanまたはlog sink失敗にapplication失敗を置換させない", () => {
    telemetry.setAttribute.mockImplementationOnce(() => {
      throw new Error("span unavailable")
    })
    telemetry.emit.mockImplementationOnce(() => {
      throw new Error("log unavailable")
    })

    expect(() => createAgentFailureCapture(local)("model_failed")).not.toThrow()
    expect(telemetry.setStatus).toHaveBeenCalledWith({ code: 2 })
  })

  it("固定local endpoint外ではlocal logを出力しない", () => {
    createAgentFailureCapture({
      ...local,
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://remote.example.test",
    })("model_failed")

    expect(telemetry.emit).not.toHaveBeenCalled()
    expect(telemetry.setStatus).toHaveBeenCalledWith({ code: 2 })
  })
})
