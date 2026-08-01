import { trace } from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"

type LocalTelemetryEnvironment = {
  AGENT_EVAL_ALLOWED_TOOLS?: string
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  NODE_ENV?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
}

const MAX_CAUSES = 5
const MAX_MESSAGE_LENGTH = 8 * 1024
const MAX_STACK_LENGTH = 32 * 1024
const MAX_DEPTH = 4
const MAX_ENTRIES = 32
const developmentErrorCodes: Record<string, string> = {
  "action-resume": "resume_failed",
  "agent-request": "internal_error",
  "chat-runtime": "model_failed",
  "connection-ticket": "connection_failed",
  "memory-history": "memory_failed",
  "memory-threads": "memory_failed",
  "product-model": "model_failed",
  "product-model-start": "model_failed",
  "product-model-stream": "model_failed",
  "product-output": "model_failed",
  "response-stream": "response_stream_failed",
  "run-finalization": "run_finalization_failed",
  "run-settlement": "run_settlement_failed",
  "run-start": "run_start_failed",
  "telemetry-flush": "telemetry_flush_failed",
  "usage-record": "usage_record_failed",
  "web-search-provider": "tool_failed",
}
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

const redactDevelopmentErrorText = (value: string): string =>
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

const keyName = (key: PropertyKey): string => {
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
    output[keyName(key)] = property.found
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
    if (typeof message.value === "string") {
      return truncate(
        redactDevelopmentErrorText(message.value),
        MAX_MESSAGE_LENGTH
      )
    }
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
    if (typeof name.value === "string" && name.value) {
      return truncate(redactDevelopmentErrorText(name.value), 256)
    }
    try {
      current = Object.getPrototypeOf(current)
    } catch {
      break
    }
  }
  return "NonError"
}

type DevelopmentCauseRecord = Record<string, boolean | number | string>

const errorCodeForOperation = (label: string): string => {
  const code = Reflect.get(developmentErrorCodes, label)
  return typeof code === "string" ? code : "agent_runtime_failed"
}

const developmentCauseRecords = (
  label: string,
  cause: unknown,
  resource: Record<string, string>
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
      if (spanContext) {
        traceContext = {
          span_id: spanContext.spanId,
          trace_id: spanContext.traceId,
        }
      }
    } catch {
      traceContext = {}
    }
    records.push({
      ...resource,
      ...traceContext,
      "app.error.code": errorCodeForOperation(label),
      "app.operation": label,
      "app.outcome": "failure",
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

type DevelopmentErrorDependencies = {
  consoleError(record: DevelopmentCauseRecord): void
  logError(record: DevelopmentCauseRecord): void
}

const defaultDependencies: DevelopmentErrorDependencies = {
  consoleError(record) {
    console.error("[agent development]", record)
  },
  logError(record) {
    logs.getLogger("enterprise-agentic-saas-agent").emit({
      attributes: record,
      body: "Agent development exception cause",
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
    })
  },
}

export const reportDevelopmentCauseChain = (
  environment: LocalTelemetryEnvironment,
  label: string,
  cause: unknown,
  dependencies: DevelopmentErrorDependencies = defaultDependencies
): void => {
  const sessionId = environment.DEV_SESSION_ID?.trim()
  const worktreeId = environment.DEV_WORKTREE_ID?.trim()
  if (
    environment.NODE_ENV !== "development" ||
    environment.AGENT_EVAL_ALLOWED_TOOLS ||
    environment.OTEL_EXPORTER_OTLP_ENDPOINT !== "http://127.0.0.1:4318" ||
    !sessionId ||
    !worktreeId
  ) {
    return
  }
  const records = developmentCauseRecords(label, cause, {
    "dev.session.id": sessionId,
    "dev.worktree.id": worktreeId,
    "service.name": "enterprise-agentic-saas-agent",
  })
  for (const record of records) {
    try {
      dependencies.consoleError(record)
    } catch {
      // A terminal failure must not suppress the local OTLP log.
    }
    try {
      dependencies.logError(record)
    } catch {
      // A local OTLP failure must not suppress the application response.
    }
  }
}
