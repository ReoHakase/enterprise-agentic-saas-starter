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

export const configureObservability = (
  nextRuntime: ObservabilityRuntime
): void => {
  runtime = nextRuntime
}

export const captureObservedException = (
  error: unknown,
  context: ErrorTelemetryContext
): void => {
  runtime.captureException(error, context)
}

export const logObservedResponse = (
  level: "error" | "info" | "warn",
  attributes: TelemetryAttributes
): void => {
  runtime.logResponse(level, attributes)
}

export const recordObservedHttpStatus = (
  statusCode: number,
  errorCode?: string
): void => {
  runtime.recordHttpStatus(statusCode, errorCode)
}

export const setObservedRequestContext = (
  context: RequestTelemetryContext
): void => {
  runtime.setRequestContext(context)
}

export const withObservedSpan = <T>(
  options: {
    attributes?: TelemetryAttributes
    name: string
    op: string
  },
  callback: () => T
): T => runtime.startSpan(options, callback)
