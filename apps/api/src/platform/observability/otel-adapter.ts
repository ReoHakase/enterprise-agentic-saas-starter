import { getLogger } from "@inference-net/otel-cf-workers"
import {
  context as otelContext,
  createContextKey,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api"

import {
  activeTraceAttributes,
  redactDevelopmentErrorText,
  redactTelemetryAttributes,
  reportDevelopmentCauseChain,
} from "./development-error"
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

const loggerScope = (
  attributes: Record<string, unknown>,
  fallback: string
): string => {
  const scope = attributes["logger.scope"]
  return typeof scope === "string" && scope.length > 0 ? scope : fallback
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
  if (
    !(
      (typeof value === "object" && value !== null) ||
      typeof value === "function"
    )
  )
    return false
  try {
    return "then" in value && typeof value.then === "function"
  } catch {
    return false
  }
}

const waitUntilContextKey = createContextKey(
  "enterprise-agentic-saas.observability.wait-until"
)

type WaitUntil = (completion: Promise<unknown>) => void

const isWaitUntil = (value: unknown): value is WaitUntil =>
  typeof value === "function"

const activeWaitUntil = (): WaitUntil | undefined => {
  const value = otelContext.active().getValue(waitUntilContextKey)
  return isWaitUntil(value) ? value : undefined
}

export const withOtelObservabilityWaitUntil = <T>(
  waitUntil: WaitUntil,
  callback: () => T
): T =>
  otelContext.with(
    otelContext.active().setValue(waitUntilContextKey, waitUntil),
    callback
  )

export const createOtelObservabilityRuntime = (
  service: string,
  resource?: LocalTelemetryResource,
  reportDevelopmentErrors = true
): ObservabilityRuntime => {
  const tracer = trace.getTracer(service)
  const loggers = new Map<string, ReturnType<typeof getLogger>>()
  const getScopedLogger = (scope: string) => {
    const loggerName = `${service}.${scope}`
    const existing = loggers.get(loggerName)
    if (existing) return existing
    const logger = getLogger(loggerName)
    if (resource) logger.setProperties(resource)
    loggers.set(loggerName, logger)
    return logger
  }

  return {
    captureException(error, context) {
      const span = trace.getActiveSpan()
      span?.setAttribute("app.error.code", context.errorCode)
      span?.setStatus({ code: SpanStatusCode.ERROR })
      if (!resource || !reportDevelopmentErrors) return

      const correlation = activeTraceAttributes()
      reportDevelopmentCauseChain(error, context, {
        log(record) {
          getScopedLogger("development.error").error(
            "Development exception cause",
            { ...resource, ...correlation, ...record }
          )
        },
        terminal(record) {
          console.error({
            ...resource,
            ...correlation,
            ...record,
            level: "error",
            severityText: "ERROR",
            "service.name": service,
            timestamp: new Date().toISOString(),
          })
        },
      })
    },
    injectRequestHeaders(headers) {
      const sessionId = resource?.["dev.session.id"]
      const worktreeId = resource?.["dev.worktree.id"]
      if (sessionId) headers.set("x-dev-session-id", sessionId)
      if (worktreeId) headers.set("x-dev-worktree-id", worktreeId)
    },
    logEvent(level, message, attributes) {
      const scope = loggerScope(attributes, "application")
      const eventAttributes = redactTelemetryAttributes({
        ...resource,
        ...activeTraceAttributes(),
        ...attributes,
        "event.name": attributes["event.name"] ?? message,
        "logger.scope": scope,
      })
      getScopedLogger(scope)[level](
        redactDevelopmentErrorText(message),
        eventAttributes
      )
    },
    logResponse(level, attributes) {
      getScopedLogger("http")[level](
        "HTTP request completed",
        redactTelemetryAttributes({
          ...resource,
          ...activeTraceAttributes(),
          ...attributes,
          "event.name": "http.response.completed",
          "logger.scope": "http",
        })
      )
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
        request_id: context.requestId,
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
          let deferred = false
          let ended = false
          const end = (failed = false, endTime?: number) => {
            if (ended) return
            ended = true
            if (failed) {
              span.setAttribute("app.error.code", "internal_error")
              span.setStatus({ code: SpanStatusCode.ERROR })
            }
            span.end(endTime)
          }
          const lifecycle = {
            endWhen(completion: PromiseLike<unknown>) {
              deferred = true
              const completionPromise = Promise.resolve(completion)
              const waitUntil = activeWaitUntil()
              span.setAttribute("app.span.deferred", true)
              span.setAttribute(
                "app.span.wait_until_registered",
                waitUntil !== undefined
              )
              try {
                waitUntil?.(completionPromise)
              } catch {
                // Telemetry completion must not change the application response.
              }
              void completionPromise.then(
                () => end(false, Date.now()),
                () => end(true, Date.now())
              )
            },
          }
          try {
            const result = callback(lifecycle)
            if (isPromiseLike(result)) {
              void Promise.resolve(result).then(
                () => (deferred ? undefined : end()),
                () => end(true)
              )
              return result
            }
            if (!deferred) end()
            return result
          } catch (error) {
            end(true)
            throw error
          }
        }
      )
    },
  }
}
type LocalTelemetryResource = Record<string, string>
