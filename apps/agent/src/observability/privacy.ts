type SentryEventLike = {
  breadcrumbs?: unknown[]
  contexts?: Record<string, unknown>
  exception?: {
    values?: Array<{
      mechanism?: { handled?: boolean; type?: string }
      type?: string
      value?: string
    }>
  }
  extra?: Record<string, unknown>
  fingerprint?: string[]
  logger?: string
  logentry?: unknown
  message?: string
  measurements?: unknown
  modules?: Record<string, string>
  request?: {
    cookies?: Record<string, string>
    data?: unknown
    env?: Record<string, string>
    headers?: Record<string, string>
    method?: string
    query_string?: unknown
    url?: string
  }
  sdkProcessingMetadata?: {
    dynamicSamplingContext?: Record<string, unknown>
    [key: string]: unknown
  }
  server_name?: string
  tags?: Record<string, unknown>
  threads?: unknown
  transaction?: string
  user?: unknown
}

type SentryLogLike = {
  attributes?: Record<string, unknown>
  message: string | readonly unknown[]
}

type SentrySpanLike = {
  data: Record<string, unknown>
  description?: string
  links?: unknown[]
  measurements?: unknown
  op?: string
  profile_id?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const safeTag = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(value)
    ? value
    : undefined

const safeTags = (
  tags: Record<string, unknown> | undefined
): Record<string, string> | undefined => {
  if (tags === undefined) return undefined
  const component = safeTag(tags.component)
  const errorCode = safeTag(tags.errorCode)
  const output: Record<string, string> = {}
  if (component !== undefined) output.component = component
  if (errorCode !== undefined) output.errorCode = errorCode
  return output
}

const HTTP_METHODS = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
])

const safeHttpMethod = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const method = value.toUpperCase()
  return HTTP_METHODS.has(method) ? method : undefined
}

const normalizeTransaction = (value: string): string => {
  const [method, target = "unknown"] = value.split(" ", 2)
  const [path = "unknown"] = target.split("?", 1)
  const normalizedPath =
    path === "/chat" || path === "/actions/resume" ? path : "/unmatched"
  return `${safeHttpMethod(method) ?? "UNKNOWN"} ${normalizedPath}`
}

const safeTraceContext = (
  contexts: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  const trace = contexts?.trace
  if (!isRecord(trace)) return undefined
  const traceId = trace.trace_id
  const spanId = trace.span_id
  if (
    typeof traceId !== "string" ||
    !/^[a-f0-9]{32}$/i.test(traceId) ||
    typeof spanId !== "string" ||
    !/^[a-f0-9]{16}$/i.test(spanId)
  ) {
    return undefined
  }

  const parentSpanId = trace.parent_span_id
  return {
    trace: {
      trace_id: traceId,
      span_id: spanId,
      ...(typeof parentSpanId === "string" &&
      /^[a-f0-9]{16}$/i.test(parentSpanId)
        ? { parent_span_id: parentSpanId }
        : {}),
      ...(safeTag(trace.op) === undefined ? {} : { op: safeTag(trace.op) }),
      ...(safeTag(trace.status) === undefined
        ? {}
        : { status: safeTag(trace.status) }),
    },
  }
}

const safeSdkProcessingMetadata = (
  metadata: SentryEventLike["sdkProcessingMetadata"]
): SentryEventLike["sdkProcessingMetadata"] => {
  const input = metadata?.dynamicSamplingContext
  if (!isRecord(input)) return undefined
  const traceId = input.trace_id
  const publicKey = input.public_key
  if (
    typeof traceId !== "string" ||
    !/^[a-f0-9]{32}$/i.test(traceId) ||
    typeof publicKey !== "string" ||
    !/^[A-Za-z0-9]{8,64}$/.test(publicKey)
  ) {
    return undefined
  }

  return {
    dynamicSamplingContext: {
      public_key: publicKey,
      trace_id: traceId,
      ...(typeof input.sample_rate === "string" &&
      /^0(?:\.\d+)?$|^1(?:\.0+)?$/.test(input.sample_rate)
        ? { sample_rate: input.sample_rate }
        : {}),
      ...(input.sampled === "true" || input.sampled === "false"
        ? { sampled: input.sampled }
        : {}),
      ...(typeof input.transaction === "string"
        ? { transaction: normalizeTransaction(input.transaction) }
        : {}),
    },
  }
}

export const scrubAgentSentryEvent = <T extends SentryEventLike>(
  event: T
): T => {
  delete event.user
  delete event.extra
  delete event.fingerprint
  delete event.logger
  delete event.logentry
  delete event.measurements
  delete event.modules
  delete event.server_name
  delete event.threads
  const contexts = safeTraceContext(event.contexts)
  if (contexts === undefined) delete event.contexts
  else event.contexts = contexts
  const sdkProcessingMetadata = safeSdkProcessingMetadata(
    event.sdkProcessingMetadata
  )
  if (sdkProcessingMetadata === undefined) delete event.sdkProcessingMetadata
  else event.sdkProcessingMetadata = sdkProcessingMetadata
  event.breadcrumbs = []
  event.message =
    event.message === undefined ? undefined : "Agent runtime error"
  event.tags = safeTags(event.tags)
  if (event.request !== undefined) {
    event.request = { method: safeHttpMethod(event.request.method) }
  }
  for (const exception of event.exception?.values ?? []) {
    exception.type = "AgentRuntimeError"
    exception.value = "Agent runtime error"
    if (exception.mechanism !== undefined) {
      exception.mechanism = {
        ...(typeof exception.mechanism.handled === "boolean"
          ? { handled: exception.mechanism.handled }
          : {}),
        ...(safeTag(exception.mechanism.type) === undefined
          ? {}
          : { type: safeTag(exception.mechanism.type) }),
      }
    }
  }
  if (event.transaction !== undefined) {
    event.transaction = normalizeTransaction(event.transaction)
  }
  return event
}

export const scrubAgentSentryLog = <T extends SentryLogLike>(log: T): T => {
  log.attributes = safeTags(log.attributes)
  log.message = "Agent runtime log"
  return log
}

export const scrubAgentSentrySpan = <T extends SentrySpanLike>(span: T): T => {
  span.data = {}
  delete span.links
  delete span.measurements
  delete span.profile_id
  span.description =
    span.description === undefined ? undefined : "Agent operation"
  span.op = safeTag(span.op)
  return span
}

export const filterAgentSentryIntegrations = <T extends { name: string }>(
  integrations: T[]
): T[] =>
  integrations.filter(
    ({ name }) =>
      name !== "Console" && name !== "LinkedErrors" && name !== "RequestData"
  )

const tracesSampleRate = (value: string | undefined): number => {
  const parsed = Number(value ?? "0.1")
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1
}

export type AgentSentryEnvironment = {
  NODE_ENV?: string
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
  SENTRY_RELEASE?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
}

const noTracePropagationTargets: string[] = []

export const createAgentSentryOptions = (
  environment: AgentSentryEnvironment
) => ({
  beforeBreadcrumb: () => null,
  beforeSend: scrubAgentSentryEvent,
  beforeSendLog: scrubAgentSentryLog,
  beforeSendSpan: scrubAgentSentrySpan,
  beforeSendTransaction: scrubAgentSentryEvent,
  dsn: environment.SENTRY_DSN,
  enableLogs: false,
  enableRpcTracePropagation: false,
  environment:
    environment.SENTRY_ENVIRONMENT ??
    (environment.NODE_ENV === "development" ? "development" : "production"),
  includeServerName: false,
  integrations: filterAgentSentryIntegrations,
  maxBreadcrumbs: 0,
  release: environment.SENTRY_RELEASE,
  sampleRate: 1,
  sendDefaultPii: false,
  tracePropagationTargets: noTracePropagationTargets,
  tracesSampleRate: tracesSampleRate(environment.SENTRY_TRACES_SAMPLE_RATE),
})
