export type TelemetryAttributes = Record<
  string,
  boolean | number | string | undefined
>

export type RequestTelemetryContext = {
  method: string
  requestId: string
  route: string
}

export type ErrorTelemetryContext = RequestTelemetryContext & {
  errorCode: string
  statusCode: number
}

export type TelemetryLevel = "debug" | "error" | "info" | "warn"

export type ObservedLogger = {
  child(segment: string, attributes?: TelemetryAttributes): ObservedLogger
  debug(message: string, attributes?: TelemetryAttributes): void
  error(message: string, attributes?: TelemetryAttributes): void
  info(message: string, attributes?: TelemetryAttributes): void
  warn(message: string, attributes?: TelemetryAttributes): void
}

export type ObservedSpanLifecycle = {
  endWhen(completion: PromiseLike<unknown>): void
}

export type ObservabilityRuntime = {
  captureException(error: unknown, context: ErrorTelemetryContext): void
  injectRequestHeaders(headers: Headers): void
  logEvent(
    level: TelemetryLevel,
    message: string,
    attributes: TelemetryAttributes
  ): void
  logResponse(level: TelemetryLevel, attributes: TelemetryAttributes): void
  recordHttpStatus(statusCode: number, errorCode?: string): void
  setRequestContext(context: RequestTelemetryContext): void
  startSpan<T>(
    options: {
      attributes?: TelemetryAttributes
      name: string
      op: string
    },
    callback: (lifecycle: ObservedSpanLifecycle) => T
  ): T
}

const noopSpanLifecycle: ObservedSpanLifecycle = {
  endWhen: () => undefined,
}

const noopRuntime: ObservabilityRuntime = {
  captureException: () => undefined,
  injectRequestHeaders: () => undefined,
  logEvent: () => undefined,
  logResponse: () => undefined,
  recordHttpStatus: () => undefined,
  setRequestContext: () => undefined,
  startSpan: (_options, callback) => callback(noopSpanLifecycle),
}

let runtime = noopRuntime

const ignoreTelemetryFailure = (operation: () => void): void => {
  try {
    operation()
  } catch {
    // Telemetry is never allowed to change the application response.
  }
}

export const configureObservability = (
  nextRuntime: ObservabilityRuntime
): void => {
  runtime = nextRuntime
}

export const captureObservedException = (
  error: unknown,
  context: ErrorTelemetryContext
): void => {
  ignoreTelemetryFailure(() => runtime.captureException(error, context))
}

export const logObservedResponse = (
  level: TelemetryLevel,
  attributes: TelemetryAttributes
): void => {
  ignoreTelemetryFailure(() => runtime.logResponse(level, attributes))
}

const logObservedEvent = (
  level: TelemetryLevel,
  message: string,
  attributes: TelemetryAttributes
): void => {
  ignoreTelemetryFailure(() => runtime.logEvent(level, message, attributes))
}

export const createObservedLogger = (
  scope: string,
  baseAttributes: TelemetryAttributes = {}
): ObservedLogger => {
  const write = (
    level: TelemetryLevel,
    message: string,
    attributes: TelemetryAttributes = {}
  ) =>
    logObservedEvent(level, message, {
      ...baseAttributes,
      ...attributes,
      "event.name": message,
      "logger.scope": scope,
    })

  return {
    child: (segment, attributes = {}) =>
      createObservedLogger(`${scope}.${segment}`, {
        ...baseAttributes,
        ...attributes,
      }),
    debug: (message, attributes) => write("debug", message, attributes),
    error: (message, attributes) => write("error", message, attributes),
    info: (message, attributes) => write("info", message, attributes),
    warn: (message, attributes) => write("warn", message, attributes),
  }
}

export const injectObservedRequestHeaders = (headers: Headers): void => {
  ignoreTelemetryFailure(() => runtime.injectRequestHeaders(headers))
}

export const recordObservedHttpStatus = (
  statusCode: number,
  errorCode?: string
): void => {
  ignoreTelemetryFailure(() => runtime.recordHttpStatus(statusCode, errorCode))
}

export const setObservedRequestContext = (
  context: RequestTelemetryContext
): void => {
  ignoreTelemetryFailure(() => runtime.setRequestContext(context))
}

export const withObservedSpan = <T>(
  options: {
    attributes?: TelemetryAttributes
    name: string
    op: string
  },
  callback: (lifecycle: ObservedSpanLifecycle) => T
): T => {
  let outcome:
    | { kind: "failure"; error: unknown }
    | { kind: "success"; value: T }
    | undefined

  const observedCallback = (lifecycle: ObservedSpanLifecycle): T => {
    try {
      const value = callback(lifecycle)
      outcome = { kind: "success", value }
      return value
    } catch (error) {
      outcome = { kind: "failure", error }
      throw error
    }
  }

  try {
    return runtime.startSpan(options, observedCallback)
  } catch {
    if (outcome?.kind === "failure") {
      throw outcome.error
    }
    if (outcome?.kind === "success") {
      return outcome.value
    }
    return observedCallback(noopSpanLifecycle)
  }
}
