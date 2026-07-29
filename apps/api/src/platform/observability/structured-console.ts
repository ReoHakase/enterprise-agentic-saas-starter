import type { ObservabilityRuntime } from "./runtime"

export const withStructuredConsole = (
  runtime: ObservabilityRuntime,
  service: string
): ObservabilityRuntime => ({
  ...runtime,
  logEvent(level, message, attributes) {
    const payload = {
      ...attributes,
      event: message,
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

    runtime.logEvent(level, message, attributes)
  },
  logResponse(level, attributes) {
    const payload = {
      ...attributes,
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
