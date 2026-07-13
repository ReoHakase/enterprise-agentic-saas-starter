const REDACTED = "[REDACTED]"
const MAX_DEPTH = 5
const MAX_ARRAY_ITEMS = 20
const MAX_STRING_LENGTH = 512

const sensitiveKeyPattern =
  /(?:authorization|cookie|credential|password|passwd|secret|session|token|api.?key|dsn|body|payload|query|sql|statement|header|url|email|phone|address|user(?:name|id)?|member|tenant|organization|client\.address|ip(?:v4|v6)?|geo|city|country|region|latitude|longitude|postal|timezone)/i

const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/
const bearerPattern = /\bBearer\s+\S+/i
const basicAuthPattern = /\bBasic\s+[A-Za-z0-9+/=]+/i
const credentialPattern =
  /(?:password|passwd|secret|session|token|api.?key|authorization)\s*[:=]\s*\S+/i
const databasePattern =
  /\b(?:libsql|mysql|postgres|postgresql|redis|rediss|turso):\/\//i
const sqlPattern =
  /^\s*(?:alter|create|delete|drop|insert|pragma|replace|select|update)\b/i

const truncate = (value: string): string =>
  value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value

export const redactTelemetryString = (value: string): string => {
  if (
    emailPattern.test(value) ||
    jwtPattern.test(value) ||
    bearerPattern.test(value) ||
    basicAuthPattern.test(value) ||
    credentialPattern.test(value) ||
    databasePattern.test(value) ||
    sqlPattern.test(value)
  ) {
    return REDACTED
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      return truncate(
        `${parsed.origin}${normalizeTelemetryPath(parsed.pathname)}`
      )
    } catch {
      return REDACTED
    }
  }

  if (value.startsWith("/") && value.includes("?")) {
    return truncate(normalizeTelemetryPath(value.split("?", 1)[0] ?? "/"))
  }

  return truncate(value)
}

const scrubRecord = (value: object, depth: number): Record<string, unknown> => {
  const output: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = sensitiveKeyPattern.test(key)
      ? REDACTED
      : scrubValue(nestedValue, depth + 1)
  }

  return output
}

const scrubValue = (value: unknown, depth: number): unknown => {
  if (depth > MAX_DEPTH) {
    return "[TRUNCATED]"
  }

  if (typeof value === "string") {
    return redactTelemetryString(value)
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "undefined"
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => scrubValue(item, depth + 1))
  }

  if (typeof value !== "object") {
    return String(value)
  }

  return scrubRecord(value, depth)
}

export const scrubTelemetryAttributes = (
  attributes: Record<string, unknown> | undefined
): Record<string, unknown> | undefined =>
  attributes ? scrubRecord(attributes, 0) : undefined

const dynamicPathSegmentPattern =
  /^(?:\d+|[0-9a-f]{16,}|[A-Za-z0-9_-]{24,}|[0-9a-f]{8}-[0-9a-f-]{27,})$/i

const resourceCollectionSegments = new Set([
  "accounts",
  "comments",
  "invitations",
  "members",
  "organizations",
  "sessions",
  "todos",
  "users",
])

export const normalizeTelemetryPath = (pathname: string): string => {
  const segments = pathname.split("/")
  const normalized = segments
    .map((segment, index) => {
      const parent = segments[index - 1]
      const resourceIdentifier =
        parent !== undefined && resourceCollectionSegments.has(parent)

      return resourceIdentifier ||
        dynamicPathSegmentPattern.test(segment) ||
        emailPattern.test(segment)
        ? ":id"
        : segment
    })
    .join("/")

  return normalized || "/"
}

type SentryEventLike = {
  breadcrumbs?: unknown[]
  contexts?: Record<string, unknown>
  exception?: {
    values?: Array<{
      type?: string
      value?: string
    }>
  }
  extra?: Record<string, unknown>
  message?: string
  request?: {
    cookies?: Record<string, string>
    data?: unknown
    env?: Record<string, string>
    headers?: Record<string, string>
    method?: string
    query_string?: unknown
    url?: string
  }
  tags?: Record<string, unknown>
  transaction?: string
  user?: unknown
}

export const scrubSentryEvent = <T extends SentryEventLike>(event: T): T => {
  delete event.user
  delete event.extra
  event.breadcrumbs = []

  if (event.request) {
    event.request = {
      method: event.request.method,
    }
  }

  if (event.contexts) {
    event.contexts = scrubTelemetryAttributes(event.contexts)
  }

  if (event.tags) {
    event.tags = scrubTelemetryAttributes(event.tags)
  }

  if (event.message) {
    event.message = redactTelemetryString(event.message)
  }

  for (const exception of event.exception?.values ?? []) {
    // Stack frame groupingを維持しつつ、provider/DB error messageは送らない。
    exception.value = exception.type ?? "Application error"
  }

  if (event.transaction) {
    const [method, ...nameParts] = event.transaction.split(" ")
    const name = nameParts.join(" ")
    event.transaction = name
      ? `${method} ${normalizeTelemetryPath(name.split("?", 1)[0] ?? "/")}`
      : normalizeTelemetryPath(method ?? "unknown")
  }

  return event
}

type SentryLogLike = {
  attributes?: Record<string, unknown>
  message: string | readonly unknown[]
}

export const scrubSentryLog = <T extends SentryLogLike>(log: T): T => {
  log.attributes = scrubTelemetryAttributes(log.attributes)
  if (typeof log.message === "string") {
    log.message = redactTelemetryString(log.message)
  }
  return log
}

type SentrySpanLike = {
  data: Record<string, unknown>
  description?: string
  op?: string
}

export const scrubSentrySpan = <T extends SentrySpanLike>(span: T): T => {
  span.data = scrubTelemetryAttributes(span.data) ?? {}

  if (span.op?.startsWith("db") || sqlPattern.test(span.description ?? "")) {
    span.description = "database query"
  } else if (span.op?.startsWith("http")) {
    span.description = "HTTP request"
  } else if (span.description) {
    span.description = redactTelemetryString(span.description)
  }

  return span
}
