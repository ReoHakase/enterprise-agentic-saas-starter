import type { ObservabilityRuntime } from "./runtime"

type SentrySpan = {
  setAttribute(name: string, value: boolean | number | string): void
}

type SentryScope = {
  setContext(name: string, context: Record<string, unknown> | null): void
  setTag(name: string, value: string): void
}

export type SentryRuntimeApi = {
  captureException(
    error: unknown,
    context: {
      mechanism: { handled: boolean; type: string }
    }
  ): string
  getActiveSpan(): SentrySpan | undefined
  getIsolationScope(): SentryScope
  logger: {
    error(message: string, attributes?: Record<string, unknown>): void
    info(message: string, attributes?: Record<string, unknown>): void
    warn(message: string, attributes?: Record<string, unknown>): void
  }
  setHttpStatus(span: SentrySpan, statusCode: number): void
  startSpan<T>(
    options: {
      attributes?: Record<string, boolean | number | string | undefined>
      name: string
      onlyIfParent: boolean
      op: string
    },
    callback: () => T
  ): T
  updateSpanName(span: SentrySpan, name: string): void
  withScope(callback: (scope: SentryScope) => void): void
}

export const createSentryObservabilityRuntime = (
  sentry: SentryRuntimeApi,
  service: string
): ObservabilityRuntime => ({
  captureException(error, context) {
    sentry.withScope((scope) => {
      scope.setTag("app.error.code", context.errorCode)
      scope.setTag("request_id", context.requestId)
      scope.setContext("http", {
        method: context.method,
        route: context.route,
        status_code: context.statusCode,
      })
      sentry.captureException(error, {
        mechanism: {
          handled: true,
          type: "elysia.on_error",
        },
      })
    })
  },
  logResponse(level, attributes) {
    sentry.logger[level]("HTTP request completed", {
      ...attributes,
      service,
    })
  },
  recordHttpStatus(statusCode, errorCode) {
    const span = sentry.getActiveSpan()
    if (!span) {
      return
    }

    sentry.setHttpStatus(span, statusCode)
    if (errorCode) {
      span.setAttribute("app.error.code", errorCode)
    }
  },
  setRequestContext(context) {
    const scope = sentry.getIsolationScope()
    scope.setTag("request_id", context.requestId)
    scope.setTag("service", service)
    scope.setContext("http.route", {
      method: context.method,
      route: context.route,
    })

    const span = sentry.getActiveSpan()
    if (span) {
      span.setAttribute("http.route", context.route)
      sentry.updateSpanName(span, `${context.method} ${context.route}`)
    }
  },
  startSpan(options, callback) {
    return sentry.startSpan(
      {
        ...options,
        onlyIfParent: true,
      },
      callback
    )
  },
})
