import { describe, expect, it, vi } from "vitest"

import { reportDevelopmentCauseChain } from "./development-error"

const local = {
  DEV_SESSION_ID: "session-1",
  DEV_WORKTREE_ID: "feature-auth",
  NODE_ENV: "development",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
}

type CapturedRecord = Record<string, boolean | number | string>

const capturedRecords = (cause: unknown, label = "product-model") => {
  const records: CapturedRecord[] = []
  reportDevelopmentCauseChain(local, label, cause, {
    consoleError: (record) => records.push(record),
    logError: () => {},
  })
  return records
}

const capturedMessage = (cause: unknown) =>
  String(capturedRecords(cause)[0]?.["exception.message"])

describe("development provider error reporting", () => {
  it("redacts credentials while retaining provider text, ordinary URLs, and email", () => {
    const raw = [
      "provider rejected dev@example.test at https://example.test/help",
      "Authorization: Bearer provider-token",
      "Cookie=session-secret; second=another-secret",
      "api_key=api-secret password=hunter2",
      "oauth_token='oauth secret with spaces'",
      'connectionTicket="ticket secret with spaces"',
      "https://user:password@example.test/private",
      "https://files.example.test/object?X-Amz-Signature=signed-secret&part=1",
      "https://auth.example.test/callback?state=oauth-state-secret&next=dashboard",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    ].join("\n")

    const redacted = capturedMessage(new Error(raw))

    expect(redacted).toContain("provider rejected")
    expect(redacted).toContain("dev@example.test")
    expect(redacted).toContain("https://example.test/help")
    expect(redacted).not.toMatch(
      /provider-token|session-secret|another-secret|api-secret|hunter2|oauth secret|oauth-state-secret|ticket secret|signed-secret|eyJhbGci/iu
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
    for (const record of records) {
      expect(String(record["exception.message"]).length).toBeLessThanOrEqual(
        8 * 1024
      )
      expect(String(record["exception.stacktrace"]).length).toBeLessThanOrEqual(
        32 * 1024
      )
      expect(JSON.stringify(record)).not.toContain("stack-secret-")
      expect(record).toMatchObject({
        "app.error.code": "model_failed",
        "app.operation": "product-model",
        "event.name": "development.exception.cause",
        "logger.scope": "development.error",
      })
    }
  })

  it("isolates sinks and stays disabled outside fixed local development", () => {
    const consoleError = vi.fn<(record: unknown) => void>(() => {
      throw new Error("terminal unavailable")
    })
    const logError = vi.fn<(record: unknown) => void>(() => {
      throw new Error("OTLP unavailable")
    })
    const sinks = { consoleError, logError }

    expect(() =>
      reportDevelopmentCauseChain(
        local,
        "product-model",
        new Error("root", { cause: new Error("cause") }),
        sinks
      )
    ).not.toThrow()
    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledTimes(2)
    expect(consoleError).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ "app.error.code": "model_failed" })
    )

    for (const environment of [
      { ...local, NODE_ENV: "test" },
      { ...local, AGENT_E2E_RUN_ID: "101" },
      { ...local, AGENT_EVAL_ALLOWED_TOOLS: "web_search" },
      { ...local, OTEL_EXPORTER_OTLP_ENDPOINT: "https://remote.test" },
      { ...local, DEV_SESSION_ID: "" },
    ]) {
      reportDevelopmentCauseChain(environment, "hidden", new Error("raw"), {
        consoleError,
        logError,
      })
    }
    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledTimes(2)
  })
})
