import {
  getLogger,
  SEVERITY_NUMBERS,
  type SeverityNumber as WorkerSeverityNumber,
} from "@inference-net/otel-cf-workers"
import { trace, type HrTime, type TimeInput } from "@opentelemetry/api"
import {
  logs,
  type LoggerProvider as OtelLoggerProvider,
} from "@opentelemetry/api-logs"

import type { AgentRuntimeEnv } from "../../composition/environment"

export const LOCAL_OTLP_HTTP_ENDPOINT = "http://127.0.0.1:4318"
export const AGENT_SERVICE_NAME = "enterprise-agentic-saas-agent"

const LOCAL_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u
const WORKER_SEVERITY_NUMBERS: readonly WorkerSeverityNumber[] =
  Object.values(SEVERITY_NUMBERS)
let connected = false

const toHrTime = (value?: TimeInput): HrTime | undefined => {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return [value[0], value[1]]
  const milliseconds = value instanceof Date ? value.getTime() : value
  const seconds = Math.trunc(milliseconds / 1_000)
  return [seconds, Math.trunc((milliseconds - seconds * 1_000) * 1_000_000)]
}

const localRequestIdentity = (request?: Request) => {
  const sessionId = request?.headers.get("x-dev-session-id")?.trim()
  const worktreeId = request?.headers.get("x-dev-worktree-id")?.trim()
  return sessionId &&
    worktreeId &&
    LOCAL_ID_PATTERN.test(sessionId) &&
    LOCAL_ID_PATTERN.test(worktreeId)
    ? { sessionId, worktreeId }
    : undefined
}

export const resolveLocalTelemetryResource = (
  environment: AgentRuntimeEnv,
  request?: Request
) => {
  const requestIdentity = localRequestIdentity(request)
  const sessionId =
    requestIdentity?.sessionId ?? environment.DEV_SESSION_ID?.trim()
  const worktreeId =
    requestIdentity?.worktreeId ?? environment.DEV_WORKTREE_ID?.trim()
  if (
    environment.NODE_ENV !== "development" ||
    environment.OTEL_EXPORTER_OTLP_ENDPOINT !== LOCAL_OTLP_HTTP_ENDPOINT ||
    !sessionId ||
    !worktreeId
  )
    return undefined
  return {
    "dev.session.id": sessionId,
    "dev.worktree.id": worktreeId,
    "service.name": AGENT_SERVICE_NAME,
  }
}

export const connectMastraLoggerProvider = (
  environment: AgentRuntimeEnv
): void => {
  if (connected) return
  const provider: OtelLoggerProvider = {
    getLogger(name) {
      const scope = `mastra.${name}`
      const logger = getLogger(`${AGENT_SERVICE_NAME}.${scope}`)
      const resource = resolveLocalTelemetryResource(environment)
      if (resource) logger.setProperties(resource)
      return {
        enabled: () => true,
        emit(record) {
          const spanContext = record.context
            ? trace.getSpan(record.context)?.spanContext()
            : undefined
          logger.emit({
            attributes: { ...record.attributes, "logger.scope": scope },
            body:
              typeof record.body === "string" ||
              (record.body !== null && typeof record.body === "object")
                ? record.body
                : String(record.body ?? ""),
            observedTimeUnixNano: toHrTime(record.observedTimestamp),
            severityNumber: WORKER_SEVERITY_NUMBERS.find(
              (number) => number === record.severityNumber
            ),
            severityText: record.severityText,
            spanId: spanContext?.spanId,
            timeUnixNano: toHrTime(record.timestamp),
            traceFlags: spanContext?.traceFlags,
            traceId: spanContext?.traceId,
          })
        },
      }
    },
  }
  logs.setGlobalLoggerProvider(provider)
  connected = true
}
