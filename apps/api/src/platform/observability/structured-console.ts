import type { ObservabilityRuntime } from "./runtime"
import { scrubTelemetryAttributes } from "./sanitize"

export const withStructuredConsole = (
  runtime: ObservabilityRuntime,
  service: string
): ObservabilityRuntime => ({
  ...runtime,
  logResponse(level, attributes) {
    const safeAttributes = scrubTelemetryAttributes(attributes) ?? {}
    const payload = {
      ...safeAttributes,
      event: "http.response",
      level,
      service,
      timestamp: new Date().toISOString(),
    }

    if (level === "error") {
      console.error(payload)
    } else if (level === "warn") {
      console.warn(payload)
    } else {
      console.info(payload)
    }

    runtime.logResponse(level, attributes)
  },
})
