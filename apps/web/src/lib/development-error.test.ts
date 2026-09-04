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

const captureReport = (cause: unknown) => {
  const records: CapturedRecord[] = []
  const consoleCalls: Array<{
    context: Record<string, number | string>
    error: Error
  }> = []
  reportDevelopmentCauseChain(browserLocal, cause, errorAttributes, {
    consoleError: (error, context) => consoleCalls.push({ context, error }),
    logError: (record) => records.push(record),
  })
  return { consoleCalls, records }
}

const capturedRecords = (cause: unknown) => captureReport(cause).records

const capturedMessage = (cause: unknown) =>
  String(capturedRecords(cause)[0]?.["exception.message"])

describe("Web開発エラーの報告", () => {
  it("プロバイダー本文・URL・メールアドレスを保ちつつ認証情報を除去する", () => {
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

  it("サイクル、BigInt、シンボル、アクセサー、および敵対的なプロキシをシリアル化する", () => {
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

  it("上限5件の機密除去済みcauseレコードを出力する", () => {
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

  it("元のstackと安全なcontextを含む無害化済みError treeを1つ出力する", () => {
    const nested = new TypeError("provider token=nested-secret")
    Object.defineProperty(nested, "stack", {
      configurable: true,
      value: "TypeError: provider token=nested-stack\n    at provider.ts:2:3",
    })
    const root = new Error("request failed password=root-secret", {
      cause: nested,
    })
    Object.defineProperty(root, "stack", {
      configurable: true,
      value: "Error: request failed password=root-stack\n    at action.ts:1:2",
    })

    const { consoleCalls, records } = captureReport(root)
    const printed = consoleCalls[0]?.error
    const printedCause = printed?.cause

    expect(consoleCalls).toHaveLength(1)
    expect(printed).toBeInstanceOf(Error)
    expect(printed).not.toBe(root)
    expect(printed?.message).toBe("request failed password=[REDACTED]")
    expect(printed?.name).toBe("Error")
    expect(printed?.stack).toBe(
      "Error: request failed password=[REDACTED]\n    at action.ts:1:2"
    )
    expect(printedCause).toBeInstanceOf(Error)
    if (!(printedCause instanceof Error)) {
      throw new Error("Expected a sanitized nested Error")
    }
    expect(printedCause.message).toBe("provider token=[REDACTED]")
    expect(printedCause.name).toBe("TypeError")
    expect(printedCause.stack).toBe(
      "TypeError: provider token=[REDACTED]\n    at provider.ts:2:3"
    )
    expect(consoleCalls[0]?.context).toEqual({
      "app.error.code": "internal_error",
      "app.operation": "web.application",
      "service.name": "enterprise-agentic-saas-web-browser",
      span_id: "span-1",
      trace_id: "trace-1",
    })
    expect(consoleCalls[0]?.context).not.toHaveProperty("exception.message")
    expect(records).toHaveLength(2)
  })

  it("報告処理のstack frameを公開せず非Errorと循環参照をprojectionする", () => {
    const value: Record<string, unknown> = { message: "plain failure" }
    value.cause = value

    const { consoleCalls, records } = captureReport(value)
    const printed = consoleCalls[0]?.error

    expect(consoleCalls).toHaveLength(1)
    expect(printed?.message).toBe("plain failure")
    expect(printed?.name).toBe("NonError")
    expect(printed?.stack).toBe("")
    expect(printed?.cause).toBeUndefined()
    expect(records).toHaveLength(1)
    expect(records[0]?.["exception.cause_truncated"]).toBe(true)
  })

  it("sinkを分離し、非ローカル・サーバー・テスト環境では拒否する", () => {
    const consoleError = vi.fn<
      (error: Error, context: Record<string, number | string>) => void
    >(() => {
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
    expect(consoleError).toHaveBeenCalledTimes(1)
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

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledTimes(2)
  })

  it("instrumentationのservice名と指定HTTP contextを使う", () => {
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
      {
        consoleError:
          vi.fn<
            (error: Error, context: Record<string, number | string>) => void
          >(),
        logError,
      }
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
