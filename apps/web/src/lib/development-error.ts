import { trace } from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"

const MAX_CAUSES = 5
const MAX_MESSAGE_LENGTH = 8 * 1024
const MAX_STACK_LENGTH = 32 * 1024
const MAX_DEPTH = 4
const MAX_ENTRIES = 32
const SERVER_OTLP_ENDPOINT = "http://127.0.0.1:4318"
const BROWSER_OTLP_ENDPOINT = "https://otel.enterprise-agentic-saas.localhost"
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
const authorizationPattern = /\b(?:bearer|basic)\s+[A-Za-z0-9+/._~=-]+/giu
const authorizationHeaderPattern =
  /(\b(?:authorization|proxy[._-]?authorization)\b\s*[:=]\s*)[^\r\n]+/giu
const cookieHeaderPattern =
  /(\b(?:cookie|set[._-]?cookie)\b\s*[:=]\s*)[^\r\n]+/giu
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu
const signedQueryPattern =
  /([?&](?:x-amz-(?:credential|security-token|signature)|x-goog-(?:credential|signature)|access_token|authorization_code|client_secret|code|id_token|oauth_token|refresh_token|state|signature|sig|token)=)[^&#\s]+/giu
const urlUserInfoPattern = /(https?:\/\/)[^/@\s:]+:[^/@\s]+@/giu

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

const truncate = (value: string, limit: number): string =>
  value.length <= limit
    ? value
    : `${value.slice(0, limit - "…[TRUNCATED]".length)}…[TRUNCATED]`

const isObjectLike = (value: unknown): value is object | Function =>
  (typeof value === "object" && value !== null) || typeof value === "function"

const ownValue = (
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
  if (depth >= MAX_DEPTH) return "[max-depth]"
  seen.add(value)

  let keys: PropertyKey[]
  try {
    keys = Reflect.ownKeys(value).slice(0, MAX_ENTRIES)
  } catch {
    return "[unreadable-object]"
  }
  const output: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const property = ownValue(value, key)
    let name = "[unreadable-key]"
    try {
      name = typeof key === "symbol" ? `[${String(key)}]` : String(key)
    } catch {
      // Keep the bounded fallback key.
    }
    output[name] = property.found
      ? property.value === undefined
        ? "[accessor-or-undefined]"
        : boundedProjection(property.value, seen, depth + 1)
      : "[unreadable-property]"
  }
  return output
}

const serializeDevelopmentErrorValue = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(boundedProjection(value, new Set(), 0))
    return truncate(
      redactDevelopmentErrorText(serialized ?? "[unserializable]"),
      MAX_MESSAGE_LENGTH
    )
  } catch {
    return "[unserializable]"
  }
}

const messageOf = (value: unknown): string => {
  if (typeof value === "string")
    return truncate(redactDevelopmentErrorText(value), MAX_MESSAGE_LENGTH)
  if (isObjectLike(value)) {
    const message = ownValue(value, "message")
    if (typeof message.value === "string")
      return truncate(
        redactDevelopmentErrorText(message.value),
        MAX_MESSAGE_LENGTH
      )
  }
  return serializeDevelopmentErrorValue(value)
}

const stackOf = (value: unknown): string => {
  if (!isObjectLike(value)) return ""
  const stack = ownValue(value, "stack")
  return typeof stack.value === "string"
    ? truncate(redactDevelopmentErrorText(stack.value), MAX_STACK_LENGTH)
    : ""
}

const typeOf = (value: unknown): string => {
  if (!isObjectLike(value)) return typeof value
  let current: object | null = value
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    const name = ownValue(current, "name")
    if (typeof name.value === "string" && name.value)
      return truncate(redactDevelopmentErrorText(name.value), 256)
    try {
      current = Object.getPrototypeOf(current)
    } catch {
      break
    }
  }
  return "NonError"
}

type DevelopmentCauseRecord = Record<string, boolean | number | string>

export type DevelopmentErrorAttributes = {
  "app.error.code": string
  "app.operation": string
  "app.outcome": "failure"
  "http.request.method"?: string
  "http.response.status_code"?: number
  "http.route"?: string
  request_id?: string
}

const developmentCauseRecords = (
  cause: unknown,
  resource: Record<string, string>,
  attributes: DevelopmentErrorAttributes
): DevelopmentCauseRecord[] => {
  const records: DevelopmentCauseRecord[] = []
  const seen = new Set<object>()
  let current = cause
  for (let depth = 0; depth < MAX_CAUSES; depth += 1) {
    if (isObjectLike(current)) {
      if (seen.has(current)) {
        const previous = records.at(-1)
        if (previous) previous["exception.cause_truncated"] = true
        break
      }
      seen.add(current)
    }
    const nested = isObjectLike(current)
      ? ownValue(current, "cause")
      : { found: false }
    const hasNext = nested.found && nested.value !== undefined
    let traceContext: Record<string, string> = {}
    try {
      const spanContext = trace.getActiveSpan()?.spanContext()
      if (spanContext)
        traceContext = {
          span_id: spanContext.spanId,
          trace_id: spanContext.traceId,
        }
    } catch {
      traceContext = {}
    }
    records.push({
      ...attributes,
      ...resource,
      ...traceContext,
      "event.name": "development.exception.cause",
      "exception.cause_truncated": depth === MAX_CAUSES - 1 && hasNext,
      "exception.depth": depth,
      "exception.message": messageOf(current),
      "exception.stacktrace": stackOf(current),
      "exception.type": typeOf(current),
      "logger.scope": "development.error",
    })
    if (!hasNext) break
    current = nested.value
  }
  return records
}

export type ReporterEnvironment = {
  endpoint?: string
  isBrowser: boolean
  isTest?: boolean
  nodeEnv?: string
  sessionId?: string
  worktreeId?: string
}

export const isDevelopmentCauseReportingEnabled = (
  environment: ReporterEnvironment
): boolean => {
  const sessionId = environment.sessionId?.trim()
  const worktreeId = environment.worktreeId?.trim()
  const expectedEndpoint = environment.isBrowser
    ? BROWSER_OTLP_ENDPOINT
    : SERVER_OTLP_ENDPOINT
  return (
    environment.nodeEnv === "development" &&
    !environment.isTest &&
    environment.endpoint === expectedEndpoint &&
    Boolean(sessionId) &&
    Boolean(worktreeId)
  )
}

type ReporterDependencies = {
  consoleError(error: Error, context: Record<string, number | string>): void
  logError(record: DevelopmentCauseRecord): void
}

const defaultDependencies: ReporterDependencies = {
  consoleError(error, context) {
    console.error(error, context)
  },
  logError(record) {
    const serviceName = record["service.name"]
    logs
      .getLogger(
        typeof serviceName === "string"
          ? serviceName
          : "enterprise-agentic-saas-web-server"
      )
      .emit({
        attributes: record,
        body: "Web development exception cause",
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
      })
  },
}

const consoleContextOf = (
  record: DevelopmentCauseRecord
): Record<string, number | string> => {
  const context: Record<string, number | string> = {}
  for (const key of [
    "app.error.code",
    "app.operation",
    "service.name",
    "http.request.method",
    "http.response.status_code",
    "http.route",
    "request_id",
    "trace_id",
    "span_id",
  ] as const) {
    const value = record[key]
    if (typeof value === "number" || typeof value === "string") {
      context[key] = value
    }
  }
  return context
}

const sanitizedErrorOf = (records: DevelopmentCauseRecord[]): Error => {
  let cause: Error | undefined
  for (const record of records.toReversed()) {
    const error = new Error(String(record["exception.message"]), { cause })
    error.name = String(record["exception.type"])
    error.stack = String(record["exception.stacktrace"])
    cause = error
  }
  return cause ?? new Error("Unknown development error")
}

export const reportDevelopmentCauseChain = (
  environment: ReporterEnvironment,
  cause: unknown,
  attributes: DevelopmentErrorAttributes,
  dependencies: ReporterDependencies = defaultDependencies
): void => {
  const sessionId = environment.sessionId?.trim()
  const worktreeId = environment.worktreeId?.trim()
  if (
    !isDevelopmentCauseReportingEnabled(environment) ||
    !sessionId ||
    !worktreeId
  )
    return

  const serviceName = environment.isBrowser
    ? "enterprise-agentic-saas-web-browser"
    : "enterprise-agentic-saas-web-server"
  const records = developmentCauseRecords(
    cause,
    {
      "dev.session.id": sessionId,
      "dev.worktree.id": worktreeId,
      "service.name": serviceName,
    },
    attributes
  )
  const rootRecord = records[0]
  if (rootRecord) {
    try {
      dependencies.consoleError(
        sanitizedErrorOf(records),
        consoleContextOf(rootRecord)
      )
    } catch {
      // A console failure must not suppress local OTLP logs.
    }
  }
  for (const record of records)
    try {
      dependencies.logError(record)
    } catch {
      // A local OTLP failure must not suppress other causes or the response.
    }
}
