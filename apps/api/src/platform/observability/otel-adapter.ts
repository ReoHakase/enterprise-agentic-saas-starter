import { getLogger } from "@inference-net/otel-cf-workers"
import {
  context as otelContext,
  createContextKey,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api"

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

const loggerScope = (
  attributes: Record<string, unknown>,
  fallback: string
): string => {
  const scope = attributes["logger.scope"]
  return typeof scope === "string" && scope.length > 0 ? scope : fallback
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === "object" && value !== null) || typeof value === "function"
    ? "then" in value && typeof value.then === "function"
    : false

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
  resource?: LocalTelemetryResource
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
      const recorded = toRecordedException(error)
      const span = trace.getActiveSpan()
      span?.recordException(recorded)
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: context.errorCode,
      })
      getScopedLogger("http").error("HTTP request failed", {
        ...resource,
        ...context,
        "event.name": "HTTP request failed",
        "logger.scope": "http",
        "exception.message": recorded.message,
        "exception.stacktrace": recorded.stack ?? "",
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
      const eventAttributes = {
        ...resource,
        ...attributes,
        "event.name": attributes["event.name"] ?? message,
        "logger.scope": scope,
      }
      trace
        .getActiveSpan()
        ?.addEvent(message, scalarAttributes(eventAttributes))
      getScopedLogger(scope)[level](message, eventAttributes)
    },
    logResponse(level, attributes) {
      getScopedLogger("http")[level]("HTTP request completed", {
        ...resource,
        ...attributes,
        "event.name": "HTTP request completed",
        "logger.scope": "http",
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
          let deferred = false
          let ended = false
          const end = (error?: unknown, endTime?: number) => {
            if (ended) return
            ended = true
            if (error !== undefined) {
              span.recordException(toRecordedException(error))
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
                () => end(undefined, Date.now()),
                (error) => end(error, Date.now())
              )
            },
          }
          try {
            const result = callback(lifecycle)
            if (isPromiseLike(result)) {
              void Promise.resolve(result).then(
                () => (deferred ? undefined : end()),
                (error) => end(error)
              )
              return result
            }
            if (!deferred) end()
            return result
          } catch (error) {
            end(error)
            throw error
          }
        }
      )
    },
  }
}
type LocalTelemetryResource = Record<string, string>
