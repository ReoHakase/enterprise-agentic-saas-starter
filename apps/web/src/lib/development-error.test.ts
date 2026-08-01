import { describe, expect, it, vi } from "vitest"

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getActiveSpan: () => ({
      spanContext: () => ({ spanId: "span-1", traceId: "trace-1" }),
    }),
  },
}))

import {
  redactDevelopmentErrorText,
  reportDevelopmentCauseChain,
} from "./development-error"

const browserLocal = {
  endpoint: "https://otel.enterprise-agentic-saas.localhost",
  isBrowser: true,
  nodeEnv: "development",
  sessionId: "session-1",
  worktreeId: "feature-errors",
}
const errorAttributes = {
  "app.error.code": "internal_error",
  "app.operation": "web.application",
  "app.outcome": "failure",
} as const

type CapturedRecord = Record<string, boolean | number | string>

const capturedRecords = (cause: unknown) => {
  const records: CapturedRecord[] = []
  reportDevelopmentCauseChain(browserLocal, cause, errorAttributes, {
    consoleError: (record) => records.push(record),
    logError: () => {},
  })
  return records
}

const capturedMessage = (cause: unknown) =>
  String(capturedRecords(cause)[0]?.["exception.message"])

describe("Web development error reporting", () => {
  it("redacts credentials while retaining provider text, URLs, and email", () => {
    const raw = [
      "provider rejected dev@example.test at https://example.test/help",
      "Authorization: Bearer provider-token",
      "Cookie=session-secret; second=another-secret",
      "api_key=api-secret password=hunter2",
      "oauth_token='oauth secret with spaces'",
      'verificationCode="verification secret with spaces"',
      "https://user:password@example.test/private",
      "https://files.example.test/object?X-Amz-Signature=signed-secret&part=1",
      "https://auth.example.test/callback?state=oauth-state-secret&next=dashboard",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    ].join("\n")

    const redacted = redactDevelopmentErrorText(raw)

    expect(redacted).toContain("provider rejected")
    expect(redacted).toContain("dev@example.test")
    expect(redacted).toContain("https://example.test/help")
    expect(redacted).not.toMatch(
      /provider-token|session-secret|another-secret|api-secret|hunter2|oauth secret|oauth-state-secret|verification secret|signed-secret|eyJhbGci/iu
    )
  })

  it("serializes cycles, BigInt, symbols, accessors, and hostile proxies", () => {
    const value: Record<string, unknown> = {
      count: 10n,
      symbol: Symbol("opaque"),
    }
    value.self = value
    Object.defineProperty(value, "getter", {
      enumerable: true,
      get: () => {
        throw new Error("credential=must-not-run")
      },
    })
    const hostile = new Proxy(value, {
      ownKeys: () => {
        throw new Error("password=must-not-escape")
      },
    })

    const serialized = capturedMessage(value)
    expect(serialized).toContain("10n")
    expect(serialized).toContain("[circular]")
    expect(serialized).toContain("[accessor-or-undefined]")
    expect(capturedMessage(hostile)).toBe('"[unreadable-object]"')
  })

  it("emits at most five bounded, redacted cause records", () => {
    let cause: Error | undefined
    for (let index = 6; index >= 0; index -= 1) {
      cause = new Error(
        `${"m".repeat(9 * 1024)} Authorization: Bearer secret-${index}`,
        { cause }
      )
      cause.stack = `${"s".repeat(33 * 1024)} token=stack-secret-${index}`
    }

    const records = capturedRecords(cause)

    expect(records).toHaveLength(5)
    expect(records.at(-1)?.["exception.cause_truncated"]).toBe(true)
    expect(records[0]).toMatchObject({
      ...errorAttributes,
      span_id: "span-1",
      trace_id: "trace-1",
    })
    for (const record of records) {
      expect(String(record["exception.message"]).length).toBeLessThanOrEqual(
        8 * 1024
      )
      expect(String(record["exception.stacktrace"]).length).toBeLessThanOrEqual(
        32 * 1024
      )
      expect(JSON.stringify(record)).not.toContain("stack-secret-")
    }
  })

  it("isolates sinks and rejects non-local, server, and test gates", () => {
    const consoleError = vi.fn<(record: unknown) => void>(() => {
      throw new Error("console unavailable")
    })
    const logError = vi.fn<(record: unknown) => void>(() => {
      throw new Error("OTLP unavailable")
    })
    const sinks = { consoleError, logError }

    expect(() =>
      reportDevelopmentCauseChain(
        browserLocal,
        new Error("root", { cause: new Error("cause") }),
        errorAttributes,
        sinks
      )
    ).not.toThrow()
    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledTimes(2)

    for (const environment of [
      { ...browserLocal, isTest: true },
      { ...browserLocal, endpoint: "https://remote.test" },
      { ...browserLocal, sessionId: "" },
      {
        ...browserLocal,
        endpoint: "https://otel.enterprise-agentic-saas.localhost.evil.test",
      },
      {
        ...browserLocal,
        endpoint: "http://127.0.0.1:4318",
        isBrowser: true,
      },
    ])
      reportDevelopmentCauseChain(
        environment,
        new Error("raw"),
        { ...errorAttributes, "app.operation": "hidden" },
        sinks
      )

    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledTimes(2)
  })

  it("uses the instrumentation service name and supplied HTTP context", () => {
    const logError = vi.fn<(record: unknown) => void>()

    reportDevelopmentCauseChain(
      {
        ...browserLocal,
        endpoint: "http://127.0.0.1:4318",
        isBrowser: false,
      },
      new Error("server failure"),
      {
        "app.error.code": "service_unavailable",
        "app.operation": "next.request",
        "app.outcome": "failure",
        "http.request.method": "POST",
        "http.response.status_code": 503,
        "http.route": "/organization/[organizationSlug]",
        request_id: "request-1",
      },
      { consoleError: vi.fn<(record: unknown) => void>(), logError }
    )

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        "app.error.code": "service_unavailable",
        "app.operation": "next.request",
        "app.outcome": "failure",
        "http.request.method": "POST",
        "http.response.status_code": 503,
        "http.route": "/organization/[organizationSlug]",
        request_id: "request-1",
        "service.name": "enterprise-agentic-saas-web-server",
        span_id: "span-1",
        trace_id: "trace-1",
      })
    )
  })
})
