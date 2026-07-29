import { SpanStatusCode, trace } from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"

export const reportObservedError = (error: unknown): void => {
  const normalized =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : JSON.stringify(error))
  const span = trace.getActiveSpan()
  span?.recordException(normalized)
  span?.setStatus({ code: SpanStatusCode.ERROR, message: normalized.message })
  logs.getLogger("enterprise-agentic-saas-web").emit({
    attributes: {
      "exception.message": normalized.message,
      "exception.stacktrace": normalized.stack ?? "",
    },
    body: "Web application error",
    severityNumber: SeverityNumber.ERROR,
    severityText: "ERROR",
  })
}
