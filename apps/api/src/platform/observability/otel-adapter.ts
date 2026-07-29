import { getLogger } from "@inference-net/otel-cf-workers"
import { SpanStatusCode, trace } from "@opentelemetry/api"

import type { ObservabilityRuntime } from "./runtime"

const scalarAttributes = (attributes: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, boolean | number | string | undefined] =>
        entry[1] === undefined ||
        typeof entry[1] === "boolean" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "string"
    )
  )

const toRecordedException = (error: unknown) => {
  if (error instanceof Error) return error
  return new Error(typeof error === "string" ? error : JSON.stringify(error))
}

export const createOtelObservabilityRuntime = (
  service: string,
  resource?: LocalTelemetryResource
): ObservabilityRuntime => {
  const tracer = trace.getTracer(service)
  const logger = getLogger(service)

  return {
    captureException(error, context) {
      const recorded = toRecordedException(error)
      const span = trace.getActiveSpan()
      span?.recordException(recorded)
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: context.errorCode,
      })
      logger.error("HTTP request failed", {
        ...resource,
        ...context,
        "exception.message": recorded.message,
        "exception.stacktrace": recorded.stack ?? "",
      })
    },
    logResponse(level, attributes) {
      logger[level]("HTTP request completed", {
        ...resource,
        ...attributes,
      })
    },
    recordHttpStatus(statusCode, errorCode) {
      const span = trace.getActiveSpan()
      span?.setAttribute("http.response.status_code", statusCode)
      if (errorCode) span?.setAttribute("app.error.code", errorCode)
      if (statusCode >= 500) span?.setStatus({ code: SpanStatusCode.ERROR })
    },
    setRequestContext(context) {
      trace.getActiveSpan()?.setAttributes({
        "http.request.method": context.method,
        "http.route": context.route,
        "request.id": context.requestId,
        ...resource,
      })
    },
    startSpan(options, callback) {
      return tracer.startActiveSpan(
        options.name,
        {
          attributes: scalarAttributes({
            ...resource,
            ...options.attributes,
            "app.operation": options.op,
          }),
        },
        (span) => {
          try {
            const result = callback()
            if (result instanceof Promise) {
              void result.then(
                () => span.end(),
                (error) => {
                  span.recordException(toRecordedException(error))
                  span.setStatus({ code: SpanStatusCode.ERROR })
                  span.end()
                }
              )
              return result
            }
            span.end()
            return result
          } catch (error) {
            span.recordException(toRecordedException(error))
            span.setStatus({ code: SpanStatusCode.ERROR })
            span.end()
            throw error
          }
        }
      )
    },
  }
}
type LocalTelemetryResource = Record<string, string>
