import { runInNewContext } from "node:vm"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => {
  class TestContext {
    private readonly values: ReadonlyMap<symbol, unknown>

    constructor(values: ReadonlyMap<symbol, unknown> = new Map()) {
      this.values = values
    }

    getValue(key: symbol): unknown {
      return this.values.get(key)
    }

    setValue(key: symbol, value: unknown): TestContext {
      return new TestContext(new Map([...this.values, [key, value]]))
    }
  }
  let activeContext = new TestContext()
  const span = {
    end: vi.fn<() => void>(),
    recordException: vi.fn<(error: Error) => void>(),
    addEvent:
      vi.fn<(name: string, attributes?: Record<string, unknown>) => void>(),
    setAttribute: vi.fn<(key: string, value: unknown) => void>(),
    setAttributes: vi.fn<(attributes: Record<string, unknown>) => void>(),
    setStatus: vi.fn<(status: Record<string, unknown>) => void>(),
    spanContext: vi.fn<() => { spanId: string; traceId: string }>(() => ({
      spanId: "span-1",
      traceId: "trace-1",
    })),
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
      debug: vi.fn<(message: string, attributes: unknown) => void>(),
      error: vi.fn<(message: string, attributes: unknown) => void>(),
      info: vi.fn<(message: string, attributes: unknown) => void>(),
      setProperties: vi.fn<(attributes: unknown) => void>(),
      warn: vi.fn<(message: string, attributes: unknown) => void>(),
    },
    loggerNames: Array<string>(),
    context: {
      active: () => activeContext,
      with: <T>(nextContext: TestContext, callback: () => T): T => {
        const previousContext = activeContext
        activeContext = nextContext
        try {
          return callback()
        } finally {
          activeContext = previousContext
        }
      },
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
  getLogger: (name: string) => {
    telemetry.loggerNames.push(name)
    return telemetry.logger
  },
}))

vi.mock("@opentelemetry/api", () => ({
  context: telemetry.context,
  createContextKey: (description: string) => Symbol.for(description),
  SpanStatusCode: { ERROR: 2 },
  trace: {
    getActiveSpan: () => telemetry.activeSpan,
    getTracer: () => ({ startActiveSpan: telemetry.startActiveSpan }),
  },
}))

import {
  createOtelObservabilityRuntime,
  withOtelObservabilityWaitUntil,
} from "./otel-adapter"

const resource = {
  "dev.session.id": "session-1",
  "dev.worktree.id": "feature-auth",
  "service.name": "api",
}

beforeEach(() => {
  vi.clearAllMocks()
  telemetry.activeSpan = telemetry.span
  telemetry.loggerNames.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("OpenTelemetry observability adapterの契約", () => {
  it("raw causeを報告せず固定E2 failure telemetryを維持する", () => {
    const terminal = vi.spyOn(console, "error").mockImplementation(() => {})
    const runtime = createOtelObservabilityRuntime("api", resource, false)
    runtime.captureException(new Error("provider body must stay out of E2"), {
      errorCode: "provider_failed",
      method: "POST",
      requestId: "request-1",
      route: "/agent",
      statusCode: 503,
    })

    expect(telemetry.span.setAttribute).toHaveBeenCalledWith(
      "app.error.code",
      "provider_failed"
    )
    expect(telemetry.span.setStatus).toHaveBeenCalled()
    expect(telemetry.logger.error).not.toHaveBeenCalled()
    expect(terminal).not.toHaveBeenCalled()
    terminal.mockRestore()
  })

  it("local raw detailをlogだけへ送りtrace failureを固定する", () => {
    const terminal = vi.spyOn(console, "error").mockImplementation(() => {})
    const runtime = createOtelObservabilityRuntime("api", resource)
    runtime.setRequestContext({
      method: "POST",
      requestId: "request-1",
      route: "/agent",
    })
    runtime.recordHttpStatus(503, "provider_failed")
    runtime.logEvent("debug", "Agent chat prepared", {
      "logger.scope": "agent.chat",
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
      request_id: "request-1",
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
    expect(telemetry.logger.debug).toHaveBeenCalledWith(
      "Agent chat prepared",
      expect.objectContaining({
        "logger.scope": "agent.chat",
        trigger: "submit-message",
      })
    )
    expect(telemetry.loggerNames).toContain("api.agent.chat")
    expect(telemetry.span.addEvent).not.toHaveBeenCalled()
    expect(telemetry.logger.error).toHaveBeenCalledTimes(2)
    expect(telemetry.logger.error).toHaveBeenCalledWith(
      "Development exception cause",
      expect.objectContaining({
        "app.error.code": "provider_failed",
        "exception.message": "provider body",
        span_id: "span-1",
        trace_id: "trace-1",
      })
    )
    expect(telemetry.span.recordException).not.toHaveBeenCalled()
    expect(terminal).toHaveBeenCalledTimes(2)
    terminal.mockRestore()
  })

  it("同期と非同期と失敗したspanを終了する", async () => {
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
    expect(telemetry.span.recordException).not.toHaveBeenCalled()
    expect(telemetry.span.setAttribute).toHaveBeenCalledWith(
      "app.error.code",
      "internal_error"
    )
  })

  it("cross-realm形式のthenable完了までspanを開く", async () => {
    const runtime = createOtelObservabilityRuntime("api", resource)
    const crossRealmPromise: Promise<string> = runInNewContext(
      "Promise.resolve('done')"
    )

    expect(
      runtime.startSpan(
        { name: "thenable", op: "test.thenable" },
        () => crossRealmPromise
      )
    ).toBe(crossRealmPromise)
    expect(crossRealmPromise).not.toBeInstanceOf(Promise)
    expect(telemetry.span.end).not.toHaveBeenCalled()

    await crossRealmPromise
    await vi.waitFor(() => expect(telemetry.span.end).toHaveBeenCalledOnce())
  })

  it("遅延stream完了までspanを開く", async () => {
    const waitUntil = vi.fn<(completion: Promise<unknown>) => void>()
    const runtime = createOtelObservabilityRuntime("api", resource)
    let complete: (() => void) | undefined
    const streamCompletion = new Promise<void>((resolve) => {
      complete = resolve
    })

    expect(
      withOtelObservabilityWaitUntil(waitUntil, () =>
        runtime.startSpan(
          { name: "stream", op: "test.stream" },
          (lifecycle) => {
            lifecycle.endWhen(streamCompletion)
            return "response"
          }
        )
      )
    ).toBe("response")
    expect(telemetry.span.end).not.toHaveBeenCalled()
    expect(waitUntil).toHaveBeenCalledWith(streamCompletion)

    complete?.()
    await streamCompletion
    await vi.waitFor(() => expect(telemetry.span.end).toHaveBeenCalledOnce())
    expect(telemetry.span.end).toHaveBeenCalledWith(expect.any(Number))
  })

  it("resource valueがある場合だけlocal correlation headerを注入する", () => {
    const localHeaders = new Headers()
    createOtelObservabilityRuntime("api", resource).injectRequestHeaders(
      localHeaders
    )
    expect(localHeaders.get("x-dev-session-id")).toBe("session-1")
    expect(localHeaders.get("x-dev-worktree-id")).toBe("feature-auth")

    const remoteHeaders = new Headers()
    createOtelObservabilityRuntime("api").injectRequestHeaders(remoteHeaders)
    expect([...remoteHeaders]).toEqual([])
  })

  it("active span欠如を封じ込めlocal identityなしではraw logを無効にする", () => {
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
    expect(telemetry.logger.error).not.toHaveBeenCalled()
  })
})
