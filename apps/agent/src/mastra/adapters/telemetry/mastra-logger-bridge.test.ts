import { describe, expect, it, vi } from "vitest"

const spies = vi.hoisted(() => ({
  emit: vi.fn<(record: unknown) => void>(),
  setGlobalLoggerProvider: vi.fn<(provider: unknown) => void>(),
  setProperties: vi.fn<(attributes: unknown) => void>(),
}))

vi.mock("@inference-net/otel-cf-workers", () => ({
  getLogger: () => ({
    emit: spies.emit,
    setProperties: spies.setProperties,
  }),
  SEVERITY_NUMBERS: { ERROR: 17 },
}))

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getSpan: () => ({
      spanContext: () => ({
        spanId: "0123456789abcdef",
        traceFlags: 1,
        traceId: "0123456789abcdef0123456789abcdef",
      }),
    }),
  },
}))

vi.mock("@opentelemetry/api-logs", () => ({
  logs: { setGlobalLoggerProvider: spies.setGlobalLoggerProvider },
}))

import { connectMastraLoggerProvider } from "./mastra-logger-bridge"

describe("Mastra logger bridge", () => {
  it("preserves scope, context, timestamps, and severity", () => {
    connectMastraLoggerProvider({
      AGENT_INTERNAL_API: JSON.parse("{}"),
      AGENT_RUNS_ENABLED: "1",
      AGENT_VISION_ENABLED: "0",
      AGENT_WRITES_ENABLED: "1",
      DEV_SESSION_ID: "session-1",
      DEV_WORKTREE_ID: "worktree-1",
      MASTRA_STORAGE_URL: ":memory:",
      NODE_ENV: "development",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    })

    const provider = spies.setGlobalLoggerProvider.mock.calls[0]?.[0]
    const getLogger =
      provider && typeof provider === "object"
        ? Reflect.get(provider, "getLogger")
        : undefined
    if (typeof getLogger !== "function") throw new Error("Provider unavailable")
    const logger = Reflect.apply(getLogger, provider, ["runtime"])
    if (!logger || typeof logger !== "object") {
      throw new Error("Logger unavailable")
    }
    const emit = Reflect.get(logger, "emit")
    if (typeof emit !== "function") throw new Error("Logger unavailable")
    Reflect.apply(emit, logger, [
      {
        attributes: { existing: "attribute" },
        body: 42,
        context: {},
        observedTimestamp: new Date("1970-01-01T00:00:02.000Z"),
        severityNumber: 17,
        severityText: "ERROR",
        timestamp: new Date("1970-01-01T00:00:01.000Z"),
      },
    ])

    expect(spies.emit).toHaveBeenCalledWith({
      attributes: {
        existing: "attribute",
        "logger.scope": "mastra.runtime",
      },
      body: "42",
      observedTimeUnixNano: [2, 0],
      severityNumber: 17,
      severityText: "ERROR",
      spanId: "0123456789abcdef",
      timeUnixNano: [1, 0],
      traceFlags: 1,
      traceId: "0123456789abcdef0123456789abcdef",
    })
  })
})
