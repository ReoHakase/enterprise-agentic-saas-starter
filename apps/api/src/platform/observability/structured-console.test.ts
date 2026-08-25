import { afterEach, describe, expect, it, vi } from "vitest"

import type { ObservabilityRuntime } from "./runtime"
import { withStructuredConsole } from "./structured-console"

const lifecycle = { endWhen: () => undefined }

const runtime = (
  overrides: Partial<ObservabilityRuntime> = {}
): ObservabilityRuntime => ({
  captureException: () => undefined,
  injectRequestHeaders: () => undefined,
  logEvent: () => undefined,
  logResponse: () => undefined,
  recordHttpStatus: () => undefined,
  setRequestContext: () => undefined,
  startSpan: (_options, callback) => callback(lifecycle),
  ...overrides,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("structured local consoleの契約", () => {
  it("terminalとOTLPの両log出力前にマスキングする", () => {
    const terminal = vi.spyOn(console, "error").mockImplementation(() => {})
    const logEvent = vi.fn<ObservabilityRuntime["logEvent"]>()
    const observed = withStructuredConsole(
      runtime({ logEvent }),
      "enterprise-agentic-saas-api"
    )

    observed.logEvent("error", "Authorization: Bearer body-secret", {
      "api.key": "attribute-secret",
      "logger.scope": "provider",
    })

    expect(terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        "api.key": "[REDACTED]",
        "event.name": "Authorization: [REDACTED]",
      })
    )
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "Authorization: [REDACTED]",
      expect.objectContaining({ "api.key": "[REDACTED]" })
    )
  })

  it("terminal出力が失敗してもOTLPへ続行する", () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("terminal unavailable")
    })
    const logEvent = vi.fn<ObservabilityRuntime["logEvent"]>()
    const observed = withStructuredConsole(runtime({ logEvent }), "api")

    expect(() =>
      observed.logEvent("info", "business.completed", {})
    ).not.toThrow()
    expect(logEvent).toHaveBeenCalledOnce()
  })

  it("terminal出力後のOTLP失敗を隔離する", () => {
    const terminal = vi.spyOn(console, "debug").mockImplementation(() => {})
    const observed = withStructuredConsole(
      runtime({
        logResponse: () => {
          throw new Error("OTLP unavailable")
        },
      }),
      "api"
    )

    expect(() => observed.logResponse("debug", {})).not.toThrow()
    expect(terminal).toHaveBeenCalledOnce()
  })
})
