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

export type ObservabilityRuntime = {
  captureException(error: unknown, context: ErrorTelemetryContext): void
  logResponse(
    level: "error" | "info" | "warn",
    attributes: TelemetryAttributes
  ): void
  recordHttpStatus(statusCode: number, errorCode?: string): void
  setRequestContext(context: RequestTelemetryContext): void
  startSpan<T>(
    options: {
      attributes?: TelemetryAttributes
      name: string
      op: string
    },
    callback: () => T
  ): T
}

const noopRuntime: ObservabilityRuntime = {
  captureException: () => undefined,
  logResponse: () => undefined,
  recordHttpStatus: () => undefined,
  setRequestContext: () => undefined,
  startSpan: (_options, callback) => callback(),
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
  level: "error" | "info" | "warn",
  attributes: TelemetryAttributes
): void => {
  ignoreTelemetryFailure(() => runtime.logResponse(level, attributes))
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
  callback: () => T
): T => {
  let outcome:
    | { kind: "failure"; error: unknown }
    | { kind: "success"; value: T }
    | undefined

  const observedCallback = (): T => {
    try {
      const value = callback()
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
    return observedCallback()
  }
}
