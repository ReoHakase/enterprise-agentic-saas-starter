import { describe, expect, it, vi } from "vitest"

import {
  redactDevelopmentErrorText,
  redactTelemetryAttributes,
  reportDevelopmentCauseChain,
} from "./development-error"

const context = {
  errorCode: "service_unavailable",
  method: "POST",
  requestId: "request-1",
  route: "/agent/chat",
  statusCode: 503,
}

type CapturedRecord = Record<string, boolean | number | string | undefined>

const capturedRecords = (error: unknown) => {
  const records: CapturedRecord[] = []
  reportDevelopmentCauseChain(error, context, {
    log: () => {},
    terminal: (record) => records.push(record),
  })
  return records
}

const capturedMessage = (error: unknown) =>
  String(capturedRecords(error)[0]?.["exception.message"])

describe("development error reporterの契約", () => {
  it("通常のprovider textとURLとemailを除去せずcredentialをマスキングする", () => {
    const raw = [
      "provider rejected input for dev@example.test at https://example.test/help",
      "Authorization: Bearer provider-token",
      "Cookie=session-secret; second=another-secret",
      "api_key=api-secret",
      "password=hunter2",
      "oauth_token='oauth secret with spaces'",
      'runGrant="run secret with spaces"',
      "https://user:password@example.test/private",
      "https://files.example.test/object?X-Amz-Signature=signed-secret&part=1",
      "https://auth.example.test/callback?state=oauth-state-secret&next=dashboard",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    ].join("\n")

    const redacted = redactDevelopmentErrorText(raw)

    expect(redacted).toContain("provider rejected input")
    expect(redacted).toContain("dev@example.test")
    expect(redacted).toContain("https://example.test/help")
    expect(redacted).not.toMatch(
      /provider-token|session-secret|another-secret|api-secret|hunter2|oauth secret|oauth-state-secret|run secret|signed-secret|eyJhbGci/iu
    )
    expect(redacted).toContain("[REDACTED]")

    expect(
      redactTelemetryAttributes({
        "http.request.header.authorization": "Bearer header-secret",
        detail: "token=attribute-secret normal provider text",
        email: "dev@example.test",
      })
    ).toEqual({
      "http.request.header.authorization": "[REDACTED]",
      detail: "token=[REDACTED] normal provider text",
      email: "dev@example.test",
    })
  })

  it("循環とBigIntとaccessorと敵対的proxyを例外なくserializeする", () => {
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
    expect(
      capturedMessage({
        cookie: "first=secret; second=other-secret",
        token: "serialized-secret",
      })
    ).not.toMatch(/other-secret|serialized-secret/u)
    expect(capturedMessage(hostile)).toBe('"[unreadable-object]"')
  })

  it("上限付きtextでマスキング済みcause recordを最大5件出力する", () => {
    let cause: Error | undefined
    for (let index = 6; index >= 0; index -= 1) {
      const next = new Error(
        `${"m".repeat(9 * 1024)} Authorization: Bearer secret-${index}`,
        { cause }
      )
      next.stack = `${"s".repeat(33 * 1024)} token=stack-secret-${index}`
      cause = next
    }

    const records = capturedRecords(cause)

    expect(records).toHaveLength(5)
    expect(records.map((record) => record["exception.depth"])).toEqual([
      0, 1, 2, 3, 4,
    ])
    expect(records.at(-1)?.["exception.cause_truncated"]).toBe(true)
    for (const record of records) {
      expect(String(record["exception.message"]).length).toBeLessThanOrEqual(
        8 * 1024
      )
      expect(String(record["exception.stacktrace"]).length).toBeLessThanOrEqual(
        32 * 1024
      )
      expect(String(record["exception.message"])).not.toContain("secret-")
      expect(String(record["exception.stacktrace"])).not.toContain(
        "stack-secret-"
      )
      expect(record).toMatchObject({
        "app.error.code": "service_unavailable",
        "event.name": "development.exception.cause",
        "http.request.method": "POST",
        "http.response.status_code": 503,
        "http.route": "/agent/chat",
        "logger.scope": "development.error",
        request_id: "request-1",
      })
    }
  })

  it("循環cause chainへ上限を適用する", () => {
    const error = new Error("root")
    Object.defineProperty(error, "cause", { value: error })

    const records = capturedRecords(error)

    expect(records).toHaveLength(1)
    expect(records[0]?.["exception.cause_truncated"]).toBe(true)
  })

  it("terminalとOTLP log sinkの失敗を隔離する", () => {
    const root = new Error("root", { cause: new Error("cause") })
    const terminal = vi.fn<(record: unknown) => void>(() => {
      throw new Error("terminal unavailable")
    })
    const log = vi.fn<(record: unknown) => void>(() => {
      throw new Error("OTLP unavailable")
    })

    expect(() =>
      reportDevelopmentCauseChain(root, context, { log, terminal })
    ).not.toThrow()
    expect(terminal).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledTimes(2)
  })
})
