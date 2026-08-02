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

describe("structured local console", () => {
  it("redacts before both terminal and OTLP logs", () => {
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

  it("continues to OTLP when terminal writing fails", () => {
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

  it("contains OTLP failure after writing to the terminal", () => {
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
