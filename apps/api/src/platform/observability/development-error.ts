import { trace } from "@opentelemetry/api"

import type { ErrorTelemetryContext, TelemetryAttributes } from "./runtime"

const MAX_CAUSES = 5
const MAX_MESSAGE_LENGTH = 8 * 1024
const MAX_STACK_LENGTH = 32 * 1024
const MAX_SERIALIZED_DEPTH = 4
const MAX_SERIALIZED_ENTRIES = 32
const MAX_SERIALIZED_LENGTH = MAX_MESSAGE_LENGTH

const credentialName =
  "authorization|proxy[._-]?authorization|cookie|set[._-]?cookie|api[._ -]?key|access[._ -]?token|refresh[._ -]?token|id[._ -]?token|oauth[._ -]?token|client[._ -]?secret|private[._ -]?key|run[._ -]?grant|connection[._ -]?ticket|authorization[._ -]?code|verification[._ -]?code|password|credential|secret|token"

const quotedCredentialAssignmentPattern = new RegExp(
  `(["']?\\b(?:${credentialName})\\b["']?\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`,
  "giu"
)
const credentialAssignmentPattern = new RegExp(
  `(["']?\\b(?:${credentialName})\\b["']?\\s*[:=]\\s*["']?)[^\\s,"';&#}\\]]+`,
  "giu"
)
const serializedCredentialPattern = new RegExp(
  `((?:"(?:${credentialName})"|'(?:${credentialName})')\\s*:\\s*["'])[^"']*`,
  "giu"
)
const credentialKeyPattern = new RegExp(
  `(?:^|[._-])(?:${credentialName})$`,
  "iu"
)
const authorizationPattern = /\b(?:bearer|basic)\s+[A-Za-z0-9+/._~=-]+/giu
const authorizationHeaderPattern =
  /(\b(?:authorization|proxy[._-]?authorization)\b\s*[:=]\s*)[^\r\n]+/giu
const cookieHeaderPattern =
  /(\b(?:cookie|set[._-]?cookie)\b\s*[:=]\s*)[^\r\n]+/giu
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu
const signedQueryPattern =
  /([?&](?:x-amz-(?:credential|security-token|signature)|x-goog-(?:credential|signature)|access_token|authorization_code|client_secret|code|id_token|oauth_token|refresh_token|state|signature|sig|token)=)[^&#\s]+/giu
const urlUserInfoPattern = /(https?:\/\/)[^/@\s:]+:[^/@\s]+@/giu

export const activeTraceAttributes = (): Record<string, string> => {
  try {
    const spanContext = trace.getActiveSpan()?.spanContext()
    return spanContext
      ? { span_id: spanContext.spanId, trace_id: spanContext.traceId }
      : {}
  } catch {
    return {}
  }
}

export const redactDevelopmentErrorText = (value: string): string =>
  value
    .replace(authorizationPattern, "[REDACTED]")
    .replace(quotedCredentialAssignmentPattern, "$1[REDACTED]")
    .replace(credentialAssignmentPattern, "$1[REDACTED]")
    .replace(jwtPattern, "[REDACTED]")
    .replace(signedQueryPattern, "$1[REDACTED]")
    .replace(urlUserInfoPattern, "$1[REDACTED]:[REDACTED]@")
    .replace(serializedCredentialPattern, "$1[REDACTED]")
    .replace(authorizationHeaderPattern, "$1[REDACTED]")
    .replace(cookieHeaderPattern, "$1[REDACTED]")

export const redactTelemetryAttributes = (
  attributes: TelemetryAttributes
): TelemetryAttributes =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      credentialKeyPattern.test(key)
        ? "[REDACTED]"
        : typeof value === "string"
          ? redactDevelopmentErrorText(value)
          : value,
    ])
  )

const truncate = (value: string, limit: number): string =>
  value.length <= limit
    ? value
    : `${value.slice(0, limit - "…[TRUNCATED]".length)}…[TRUNCATED]`

const safeOwnValue = (
  value: object,
  key: PropertyKey
): { found: boolean; value?: unknown } => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor && "value" in descriptor
      ? { found: true, value: descriptor.value }
      : { found: descriptor !== undefined }
  } catch {
    return { found: false }
  }
}

const isObjectLike = (value: unknown): value is object | Function =>
  (typeof value === "object" && value !== null) || typeof value === "function"

const safeErrorInstance = (value: unknown): value is Error => {
  try {
    return value instanceof Error
  } catch {
    return false
  }
}

const safeErrorName = (value: unknown): string => {
  if (!isObjectLike(value)) return typeof value

  let current: object | null = value
  for (let depth = 0; current && depth < MAX_SERIALIZED_DEPTH; depth += 1) {
    const name = safeOwnValue(current, "name")
    if (typeof name.value === "string" && name.value.length > 0) {
      return truncate(redactDevelopmentErrorText(name.value), 256)
    }
    try {
      current = Object.getPrototypeOf(current)
    } catch {
      break
    }
  }
  return safeErrorInstance(value) ? "Error" : "NonError"
}

const propertyKeyName = (key: PropertyKey): string => {
  try {
    return typeof key === "symbol" ? `[${String(key)}]` : String(key)
  } catch {
    return "[unreadable-key]"
  }
}

const boundedProjection = (
  value: unknown,
  seen: Set<object>,
  depth: number
): unknown => {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value)
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "undefined") return "[undefined]"
  if (typeof value === "symbol") {
    try {
      return String(value)
    } catch {
      return "[symbol]"
    }
  }
  if (typeof value === "function") return "[function]"
  if (!isObjectLike(value)) return `[${typeof value}]`
  if (seen.has(value)) return "[circular]"
  if (depth >= MAX_SERIALIZED_DEPTH) return "[max-depth]"
  seen.add(value)

  let keys: PropertyKey[]
  try {
    keys = Reflect.ownKeys(value).slice(0, MAX_SERIALIZED_ENTRIES)
  } catch {
    return "[unreadable-object]"
  }

  const output: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const property = safeOwnValue(value, key)
    output[propertyKeyName(key)] = property.found
      ? property.value === undefined
        ? "[accessor-or-undefined]"
        : boundedProjection(property.value, seen, depth + 1)
      : "[unreadable-property]"
  }
  return output
}

const serializeDevelopmentErrorValue = (value: unknown): string => {
  try {
    const projected = boundedProjection(value, new Set(), 0)
    const serialized = JSON.stringify(projected)
    return truncate(
      redactDevelopmentErrorText(serialized ?? "[unserializable]"),
      MAX_SERIALIZED_LENGTH
    )
  } catch {
    return "[unserializable]"
  }
}

const errorMessage = (value: unknown): string => {
  if (typeof value === "string") {
    return truncate(redactDevelopmentErrorText(value), MAX_MESSAGE_LENGTH)
  }
  if (isObjectLike(value)) {
    const message = safeOwnValue(value, "message")
    if (typeof message.value === "string") {
      return truncate(
        redactDevelopmentErrorText(message.value),
        MAX_MESSAGE_LENGTH
      )
    }
  }
  return serializeDevelopmentErrorValue(value)
}

const errorStack = (value: unknown): string => {
  if (!isObjectLike(value)) return ""
  const stack = safeOwnValue(value, "stack")
  return typeof stack.value === "string"
    ? truncate(redactDevelopmentErrorText(stack.value), MAX_STACK_LENGTH)
    : ""
}

const causeOf = (value: unknown): { found: boolean; value?: unknown } =>
  isObjectLike(value) ? safeOwnValue(value, "cause") : { found: false }

export type DevelopmentCauseRecord = TelemetryAttributes & {
  "exception.cause_truncated": boolean
  "exception.depth": number
  "exception.message": string
  "exception.stacktrace": string
  "exception.type": string
}

const developmentCauseRecords = (
  error: unknown,
  context: ErrorTelemetryContext
): DevelopmentCauseRecord[] => {
  const records: DevelopmentCauseRecord[] = []
  const seen = new Set<object>()
  let current: unknown = error

  for (let depth = 0; depth < MAX_CAUSES; depth += 1) {
    if (isObjectLike(current)) {
      if (seen.has(current)) {
        const previous = records.at(-1)
        if (previous) previous["exception.cause_truncated"] = true
        break
      }
      seen.add(current)
    }

    const cause = causeOf(current)
    const hasNext = cause.found && cause.value !== undefined
    records.push({
      "app.operation": `${context.method} ${context.route}`,
      "app.outcome": "failure",
      "app.error.code": context.errorCode,
      "event.name": "development.exception.cause",
      "exception.cause_truncated": depth === MAX_CAUSES - 1 && hasNext,
      "exception.depth": depth,
      "exception.message": errorMessage(current),
      "exception.stacktrace": errorStack(current),
      "exception.type": safeErrorName(current),
      "http.request.method": context.method,
      "http.response.status_code": context.statusCode,
      "http.route": context.route,
      "logger.scope": "development.error",
      request_id: context.requestId,
    })

    if (!hasNext) break
    current = cause.value
  }

  return records
}

export const reportDevelopmentCauseChain = (
  error: unknown,
  context: ErrorTelemetryContext,
  sinks: {
    log(record: DevelopmentCauseRecord): void
    terminal(record: DevelopmentCauseRecord): void
  }
): void => {
  const records = developmentCauseRecords(error, context)
  for (const record of records) {
    try {
      sinks.terminal(record)
    } catch {
      // A local terminal failure must not suppress the local OTLP log.
    }
    try {
      sinks.log(record)
    } catch {
      // A local OTLP failure must not suppress the application response.
    }
  }
}
