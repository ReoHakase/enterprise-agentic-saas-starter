import { beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => ({
  activeSpan: true,
  recordException: vi.fn<(error: Error) => void>(),
  setAttributes: vi.fn<(attributes: unknown) => void>(),
  setStatus: vi.fn<(status: unknown) => void>(),
  throwOnGetActiveSpan: false,
}))
const developmentReporter = vi.hoisted(() => ({
  enabled: false,
  report: vi.fn<(...args: unknown[]) => void>(),
}))

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { ERROR: 2 },
  trace: {
    getActiveSpan: () => {
      if (telemetry.throwOnGetActiveSpan) throw new Error("trace unavailable")
      return telemetry.activeSpan
        ? {
            recordException: telemetry.recordException,
            setAttributes: telemetry.setAttributes,
            setStatus: telemetry.setStatus,
          }
        : undefined
    },
  },
}))
vi.mock("./development-error", () => ({
  isDevelopmentCauseReportingEnabled: () => developmentReporter.enabled,
  redactDevelopmentErrorText: (value: string) => value,
  reportDevelopmentCauseChain: developmentReporter.report,
}))

import { reportObservedError } from "./report-observed-error"

beforeEach(() => {
  vi.clearAllMocks()
  telemetry.activeSpan = true
  telemetry.throwOnGetActiveSpan = false
  developmentReporter.enabled = false
})

describe("Web observed error reporting", () => {
  it("marks the active span without copying raw error detail into it", () => {
    reportObservedError(new Error("provider failed with visible quota details"))

    expect(telemetry.recordException).not.toHaveBeenCalled()
    expect(telemetry.setAttributes).toHaveBeenCalledWith({
      "app.error.code": "internal_error",
      "app.operation": "web.application",
      "app.outcome": "failure",
    })
    expect(telemetry.setStatus).toHaveBeenCalledWith({ code: 2 })
  })

  it("normalizes an unregistered provider error code", () => {
    const error = Object.assign(new Error("provider failed"), {
      code: "provider-private-code",
      status: 500,
    })

    reportObservedError(error)

    expect(telemetry.setAttributes).toHaveBeenCalledWith({
      "app.error.code": "internal_error",
      "app.operation": "web.application",
      "app.outcome": "failure",
      "http.response.status_code": 500,
    })
  })

  it("does not capture expected 4xx errors", () => {
    const error = Object.assign(new Error("forbidden"), { status: 403 })

    reportObservedError(error)

    expect(telemetry.setStatus).not.toHaveBeenCalled()
  })

  it.each([{ error: { status: 401 } }, { error: { statusCode: 403 } }])(
    "does not capture Better Auth nested 4xx errors",
    (error) => {
      reportObservedError(error)

      expect(telemetry.setStatus).not.toHaveBeenCalled()
    }
  )

  it("captures the same Error object once", () => {
    const error = new Error("failed")

    reportObservedError(error)
    reportObservedError(error)

    expect(telemetry.setStatus).toHaveBeenCalledOnce()
  })

  it("does not consume identity before a reporting context exists", () => {
    const error = new Error("failed")
    telemetry.activeSpan = false
    reportObservedError(error)

    telemetry.activeSpan = true
    reportObservedError(error)

    expect(telemetry.setStatus).toHaveBeenCalledOnce()
  })

  it("keeps the original Error and semantic request context for local logs", () => {
    developmentReporter.enabled = true
    const error = Object.assign(new Error("provider unavailable"), {
      requestId: "request-1",
      status: 503,
      value: { error: "service_unavailable" },
    })

    reportObservedError(error, {
      httpMethod: "post",
      httpRoute: "/agent/chat",
      operation: "agent.chat.request",
    })

    const attributes = {
      "app.error.code": "service_unavailable",
      "app.operation": "agent.chat.request",
      "app.outcome": "failure",
      "http.request.method": "POST",
      "http.response.status_code": 503,
      "http.route": "/agent/chat",
      request_id: "request-1",
    }
    expect(telemetry.setAttributes).toHaveBeenCalledWith(attributes)
    expect(developmentReporter.report).toHaveBeenCalledWith(
      expect.any(Object),
      error,
      attributes
    )
    expect(telemetry.recordException).not.toHaveBeenCalled()
  })

  it("does not let telemetry failures replace the UI error flow", () => {
    developmentReporter.enabled = true
    telemetry.setAttributes.mockImplementationOnce(() => {
      throw new Error("span unavailable")
    })
    developmentReporter.report.mockImplementationOnce(() => {
      throw new Error("log unavailable")
    })

    expect(() =>
      reportObservedError(new Error("application failure"))
    ).not.toThrow()
    expect(telemetry.setStatus).toHaveBeenCalledWith({ code: 2 })
  })

  it("still reports to fixed local logs when the trace API is unavailable", () => {
    developmentReporter.enabled = true
    telemetry.throwOnGetActiveSpan = true
    const error = new Error("application failure")

    expect(() => reportObservedError(error)).not.toThrow()
    expect(developmentReporter.report).toHaveBeenCalledWith(
      expect.any(Object),
      error,
      expect.objectContaining({ "app.error.code": "internal_error" })
    )
  })
})
