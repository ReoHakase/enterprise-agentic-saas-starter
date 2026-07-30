import { beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => ({
  emit: vi.fn<(record: unknown) => void>(),
  recordException: vi.fn<(error: Error) => void>(),
  setStatus: vi.fn<(status: unknown) => void>(),
}))

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { ERROR: 2 },
  trace: {
    getActiveSpan: () => ({
      recordException: telemetry.recordException,
      setStatus: telemetry.setStatus,
    }),
  },
}))
vi.mock("@opentelemetry/api-logs", () => ({
  logs: { getLogger: () => ({ emit: telemetry.emit }) },
  SeverityNumber: { ERROR: 17 },
}))

import { reportObservedError } from "./report-observed-error"

beforeEach(() => vi.clearAllMocks())

describe("Web observed error reporting", () => {
  it("records the developer-visible error in the active span and logger", () => {
    reportObservedError(new Error("provider failed with visible quota details"))

    expect(telemetry.recordException).toHaveBeenCalledOnce()
    expect(telemetry.recordException.mock.calls[0]?.[0]).toMatchObject({
      message: "provider failed with visible quota details",
    })
    expect(telemetry.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: 2 })
    )
    expect(telemetry.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          "exception.message": "provider failed with visible quota details",
        }),
        body: "Web application error",
      })
    )
  })
})
