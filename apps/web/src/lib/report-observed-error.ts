import { SpanStatusCode, trace } from "@opentelemetry/api"

import {
  isDevelopmentCauseReportingEnabled,
  redactDevelopmentErrorText,
  reportDevelopmentCauseChain,
  type DevelopmentErrorAttributes,
  type ReporterEnvironment,
} from "./development-error"
import { clientEnv } from "./env.client"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null
const reportedErrors = new WeakSet<object>()
const fixedErrorCodes = new Set([
  "active_organization_mismatch",
  "active_organization_required",
  "confirmation_required",
  "conflict",
  "csrf_origin_forbidden",
  "forbidden",
  "internal_error",
  "not_found",
  "rate_limited",
  "service_unavailable",
  "step_up_required",
  "unauthorized",
  "unsupported_media_type",
  "validation_error",
])
const operationPattern = /^[a-z][a-z0-9_.-]{0,127}$/u
const methodPattern = /^[A-Z]{1,16}$/u
const isHttpStatus = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 100 &&
  value <= 599

export type ObservedErrorContext = {
  errorCode?: string
  httpMethod?: string
  httpRoute?: string
  httpStatus?: number
  operation?: string
  requestId?: string
}

const propertyOf = (value: unknown, key: string): unknown => {
  if (!isRecord(value)) return undefined
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

const statusOf = (error: unknown): number | undefined => {
  const candidates = [
    error,
    propertyOf(error, "error"),
    propertyOf(error, "value"),
  ]
  for (const candidate of candidates) {
    const status = propertyOf(candidate, "status")
    if (isHttpStatus(status)) return status
    const statusCode = propertyOf(candidate, "statusCode")
    if (isHttpStatus(statusCode)) return statusCode
  }
  return undefined
}

const boundedText = (value: unknown, limit: number): string | undefined => {
  if (typeof value !== "string") return undefined
  const text = redactDevelopmentErrorText(value.trim())
  return text.length > 0 ? text.slice(0, limit) : undefined
}

const errorCodeOf = (error: unknown): string | undefined => {
  const value = propertyOf(error, "value")
  const nestedError = propertyOf(error, "error")
  const candidates = [
    propertyOf(value, "error"),
    propertyOf(error, "code"),
    propertyOf(nestedError, "code"),
  ]
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && fixedErrorCodes.has(candidate)
  )
}

const requestIdOf = (error: unknown): string | undefined => {
  const value = propertyOf(error, "value")
  const nestedError = propertyOf(error, "error")
  for (const candidate of [error, value, nestedError]) {
    const requestId =
      propertyOf(candidate, "requestId") ?? propertyOf(candidate, "request_id")
    const text = boundedText(requestId, 256)
    if (text) return text
  }
  return undefined
}

const observedErrorAttributes = (
  error: unknown,
  context: ObservedErrorContext
): DevelopmentErrorAttributes => {
  const status = isHttpStatus(context.httpStatus)
    ? context.httpStatus
    : statusOf(error)
  const errorCode =
    context.errorCode && fixedErrorCodes.has(context.errorCode)
      ? context.errorCode
      : (errorCodeOf(error) ?? "internal_error")
  const operation =
    context.operation && operationPattern.test(context.operation)
      ? context.operation
      : "web.application"
  const method = boundedText(context.httpMethod?.toUpperCase(), 16)
  const route = boundedText(context.httpRoute, 1024)
  const requestId = boundedText(context.requestId, 256) ?? requestIdOf(error)

  return {
    "app.error.code": errorCode,
    "app.operation": operation,
    "app.outcome": "failure",
    ...(method && methodPattern.test(method)
      ? { "http.request.method": method }
      : {}),
    ...(status !== undefined ? { "http.response.status_code": status } : {}),
    ...(route ? { "http.route": route } : {}),
    ...(requestId ? { request_id: requestId } : {}),
  }
}

const reporterEnvironment = (): ReporterEnvironment => {
  const isBrowser = typeof window !== "undefined"
  return {
    endpoint: isBrowser
      ? clientEnv.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT
      : process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    isBrowser,
    isTest:
      process.env.NODE_ENV === "test" ||
      process.env.VITEST === "true" ||
      (isBrowser
        ? clientEnv.NEXT_PUBLIC_BROWSER_TEST === "true"
        : process.env.PLAYWRIGHT_TEST === "true"),
    nodeEnv: process.env.NODE_ENV,
    sessionId: isBrowser
      ? clientEnv.NEXT_PUBLIC_DEV_SESSION_ID
      : process.env.DEV_SESSION_ID,
    worktreeId: isBrowser
      ? clientEnv.NEXT_PUBLIC_DEV_WORKTREE_ID
      : process.env.DEV_WORKTREE_ID,
  }
}

export const reportObservedError = (
  error: unknown,
  context: ObservedErrorContext = {}
): void => {
  const attributes = observedErrorAttributes(error, context)
  const status = attributes["http.response.status_code"]
  if (status !== undefined && status >= 400 && status < 500) return

  const environment = reporterEnvironment()
  let span: ReturnType<typeof trace.getActiveSpan>
  try {
    span = trace.getActiveSpan()
  } catch {
    span = undefined
  }
  const developmentReportingEnabled =
    isDevelopmentCauseReportingEnabled(environment)
  if (!span && !developmentReportingEnabled) return

  if (isRecord(error)) {
    if (reportedErrors.has(error)) return
    reportedErrors.add(error)
  }

  try {
    span?.setAttributes(attributes)
  } catch {
    // Telemetry must not replace the application failure being reported.
  }
  try {
    span?.setStatus({ code: SpanStatusCode.ERROR })
  } catch {
    // Telemetry must not replace the application failure being reported.
  }
  if (developmentReportingEnabled) {
    try {
      reportDevelopmentCauseChain(environment, error, attributes)
    } catch {
      // Local console or OTLP failures must not change the UI error flow.
    }
  }
}
