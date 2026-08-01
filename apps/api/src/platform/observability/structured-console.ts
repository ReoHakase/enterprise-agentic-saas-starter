import {
  activeTraceAttributes,
  redactDevelopmentErrorText,
  redactTelemetryAttributes,
} from "./development-error"
import type { ObservabilityRuntime } from "./runtime"

const writeConsole = (
  level: "debug" | "error" | "info" | "warn",
  payload: Record<string, unknown>
) => {
  try {
    if (level === "error") {
      console.error(payload)
    } else if (level === "warn") {
      console.warn(payload)
    } else if (level === "debug") {
      console.debug(payload)
    } else {
      console.info(payload)
    }
  } catch {
    // Terminal and OTLP sinks are independent in local development.
  }
}

export const withStructuredConsole = (
  runtime: ObservabilityRuntime,
  service: string
): ObservabilityRuntime => ({
  ...runtime,
  logEvent(level, message, attributes) {
    const redactedMessage = redactDevelopmentErrorText(message)
    const redactedAttributes = redactTelemetryAttributes(attributes)
    const payload = {
      ...redactedAttributes,
      ...activeTraceAttributes(),
      "event.name": redactedAttributes["event.name"] ?? redactedMessage,
      level,
      "logger.scope": redactedAttributes["logger.scope"] ?? "application",
      severityText: level.toUpperCase(),
      "service.name": service,
      timestamp: new Date().toISOString(),
    }

    writeConsole(level, payload)
    try {
      runtime.logEvent(level, redactedMessage, redactedAttributes)
    } catch {
      // Terminal and OTLP sinks are independent in local development.
    }
  },
  logResponse(level, attributes) {
    const redactedAttributes = redactTelemetryAttributes(attributes)
    const payload = {
      ...redactedAttributes,
      ...activeTraceAttributes(),
      "event.name": "http.response.completed",
      level,
      "logger.scope": "http",
      severityText: level.toUpperCase(),
      "service.name": service,
      timestamp: new Date().toISOString(),
    }

    writeConsole(level, payload)
    try {
      runtime.logResponse(level, redactedAttributes)
    } catch {
      // Terminal and OTLP sinks are independent in local development.
    }
  },
})
