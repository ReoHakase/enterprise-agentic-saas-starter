import { SpanStatusCode, trace } from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"

type LocalTelemetryEnvironment = {
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  NODE_ENV?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
}

export type AgentFailureCode =
  | "connection_failed"
  | "image_failed"
  | "memory_failed"
  | "model_failed"
  | "response_stream_failed"
  | "resume_failed"
  | "run_finalization_failed"
  | "run_grant_invalid"
  | "run_settlement_failed"
  | "run_start_failed"
  | "telemetry_flush_failed"
  | "usage_record_failed"

const failureMessages: Record<AgentFailureCode, string> = {
  connection_failed: "Agent connection failed",
  image_failed: "Agent image preparation failed",
  memory_failed: "Agent memory operation failed",
  model_failed: "Agent model response failed",
  response_stream_failed: "Agent response stream failed",
  resume_failed: "Agent action resume failed",
  run_finalization_failed: "Agent run finalization failed",
  run_grant_invalid: "Agent run grant validation failed",
  run_settlement_failed: "Agent run settlement failed",
  run_start_failed: "Agent run start failed",
  telemetry_flush_failed: "Agent telemetry flush failed",
  usage_record_failed: "Agent usage recording failed",
}

export const createAgentFailureCapture = (
  environment: LocalTelemetryEnvironment
) => {
  const sessionId = environment.DEV_SESSION_ID?.trim()
  const worktreeId = environment.DEV_WORKTREE_ID?.trim()
  const resource =
    environment.NODE_ENV === "development" &&
    environment.OTEL_EXPORTER_OTLP_ENDPOINT === "http://127.0.0.1:4318" &&
    sessionId &&
    worktreeId
      ? {
          "dev.session.id": sessionId,
          "dev.worktree.id": worktreeId,
          "service.name": "enterprise-agentic-saas-agent",
        }
      : undefined
  return (code: AgentFailureCode): void => {
    let span: ReturnType<typeof trace.getActiveSpan>
    try {
      span = trace.getActiveSpan()
    } catch {
      span = undefined
    }
    try {
      span?.setAttribute("app.error.code", code)
    } catch {
      // Telemetry must not replace the application failure being reported.
    }
    try {
      span?.setStatus({ code: SpanStatusCode.ERROR })
    } catch {
      // Telemetry must not replace the application failure being reported.
    }
    if (!resource) return
    let correlation: Record<string, string> = {}
    try {
      const spanContext = span?.spanContext()
      if (spanContext) {
        correlation = {
          span_id: spanContext.spanId,
          trace_id: spanContext.traceId,
        }
      }
    } catch {
      correlation = {}
    }
    try {
      logs.getLogger("enterprise-agentic-saas-agent").emit({
        attributes: {
          ...resource,
          ...correlation,
          "app.error.code": code,
          "app.operation": "agent.runtime",
          "app.outcome": "failure",
          "event.name": "agent.runtime.failed",
          "logger.scope": "runtime.failure",
        },
        body: failureMessages[code],
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
      })
    } catch {
      // A local OTLP failure must not replace the application failure.
    }
  }
}
