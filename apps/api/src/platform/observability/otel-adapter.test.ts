import { beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => {
  const span = {
    end: vi.fn<() => void>(),
    recordException: vi.fn<(error: Error) => void>(),
    addEvent:
      vi.fn<(name: string, attributes?: Record<string, unknown>) => void>(),
    setAttribute: vi.fn<(key: string, value: unknown) => void>(),
    setAttributes: vi.fn<(attributes: Record<string, unknown>) => void>(),
    setStatus: vi.fn<(status: Record<string, unknown>) => void>(),
  }
  let activeSpan: typeof span | undefined = span
  return {
    get activeSpan() {
      return activeSpan
    },
    set activeSpan(value: typeof span | undefined) {
      activeSpan = value
    },
    logger: {
      error: vi.fn<(message: string, attributes: unknown) => void>(),
      info: vi.fn<(message: string, attributes: unknown) => void>(),
      warn: vi.fn<(message: string, attributes: unknown) => void>(),
    },
    span,
    startActiveSpan: vi.fn<
      (
        _name: string,
        _options: unknown,
        callback: (activeSpan: {
          end(): void
          recordException(error: Error): void
          setStatus(status: Record<string, unknown>): void
        }) => unknown
      ) => unknown
    >((_name, _options, callback) => callback(span)),
  }
})

vi.mock("@inference-net/otel-cf-workers", () => ({
  getLogger: () => telemetry.logger,
}))

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { ERROR: 2 },
  trace: {
    getActiveSpan: () => telemetry.activeSpan,
    getTracer: () => ({ startActiveSpan: telemetry.startActiveSpan }),
  },
}))

import { createOtelObservabilityRuntime } from "./otel-adapter"

const resource = {
  "dev.session.id": "session-1",
  "dev.worktree.id": "feature-auth",
  "service.name": "api",
}

beforeEach(() => {
  vi.clearAllMocks()
  telemetry.activeSpan = telemetry.span
})

describe("OpenTelemetry observability adapter", () => {
  it("records request, response, status, and rich failures", () => {
    const runtime = createOtelObservabilityRuntime("api", resource)
    runtime.setRequestContext({
      method: "POST",
      requestId: "request-1",
      route: "/agent",
    })
    runtime.recordHttpStatus(503, "provider_failed")
    runtime.logEvent("info", "Agent chat prepared", {
      trigger: "submit-message",
    })
    runtime.logResponse("warn", {
      provider: "openrouter",
      statusCode: 503,
    })
    const providerError = new Error("provider body")
    providerError.stack = undefined
    runtime.captureException(providerError, {
      errorCode: "provider_failed",
      method: "POST",
      requestId: "request-1",
      route: "/agent",
      statusCode: 503,
    })
    runtime.captureException("string failure", {
      errorCode: "provider_failed",
      method: "POST",
      requestId: "request-1",
      route: "/agent",
      statusCode: 503,
    })

    expect(telemetry.span.setAttributes).toHaveBeenCalledWith({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      "http.request.method": "POST",
      "http.route": "/agent",
      "request.id": "request-1",
      "service.name": "api",
    })
    expect(telemetry.span.setAttribute).toHaveBeenCalledWith(
      "app.error.code",
      "provider_failed"
    )
    expect(telemetry.span.setStatus).toHaveBeenCalled()
    expect(telemetry.logger.warn).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({ provider: "openrouter" })
    )
    expect(telemetry.logger.info).toHaveBeenCalledWith(
      "Agent chat prepared",
      expect.objectContaining({ trigger: "submit-message" })
    )
    expect(telemetry.span.addEvent).toHaveBeenCalledWith(
      "Agent chat prepared",
      expect.objectContaining({ trigger: "submit-message" })
    )
    expect(telemetry.logger.error).toHaveBeenCalledWith(
      "HTTP request failed",
      expect.objectContaining({ errorCode: "provider_failed" })
    )
    expect(telemetry.span.recordException).toHaveBeenCalled()
  })

  it("ends synchronous, asynchronous, and failed spans", async () => {
    const runtime = createOtelObservabilityRuntime("api", resource)

    expect(
      runtime.startSpan(
        {
          attributes: { ignored: undefined, object: undefined },
          name: "sync",
          op: "test.sync",
        },
        () => "result"
      )
    ).toBe("result")
    await expect(
      runtime.startSpan({ name: "async", op: "test.async" }, async () => "done")
    ).resolves.toBe("done")
    await expect(
      runtime.startSpan({ name: "async-failed", op: "test.async-failed" }, () =>
        Promise.reject(new Error("async application failure"))
      )
    ).rejects.toThrow("async application failure")
    expect(() =>
      runtime.startSpan({ name: "failed", op: "test.failed" }, () => {
        throw new Error("application failure with provider quota details")
      })
    ).toThrow("provider quota details")
    const nonErrorFailure = {
      detail: "rich non-Error failure",
    }
    let rethrown: unknown
    try {
      runtime.startSpan({ name: "non-error", op: "test.non-error" }, () => {
        throw nonErrorFailure
      })
    } catch (error) {
      rethrown = error
    }
    expect(rethrown).toBe(nonErrorFailure)

    expect(telemetry.span.end).toHaveBeenCalledTimes(5)
    expect(telemetry.span.recordException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "application failure with provider quota details"
        ),
      })
    )
    expect(telemetry.span.recordException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("rich non-Error failure"),
      })
    )
  })

  it("contains absent active spans and projects non-Error failures", () => {
    telemetry.activeSpan = undefined
    const runtime = createOtelObservabilityRuntime("api")

    expect(() => {
      runtime.recordHttpStatus(204)
      runtime.setRequestContext({
        method: "GET",
        requestId: "request-2",
        route: "/health",
      })
      runtime.captureException(
        { detail: "provider body" },
        {
          errorCode: "internal_error",
          method: "GET",
          requestId: "request-2",
          route: "/health",
          statusCode: 500,
        }
      )
    }).not.toThrow()
    expect(telemetry.logger.error).toHaveBeenCalled()
  })
})
