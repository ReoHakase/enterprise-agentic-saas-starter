import { SpanStatusCode, trace } from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"

type LocalTelemetryEnvironment = {
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  NODE_ENV?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
}

export type AgentFailureCode =
  | "image_failed"
  | "memory_commit_deferred"
  | "model_failed"
  | "resume_failed"
  | "run_grant_invalid"
  | "run_start_failed"
  | "title_failed"
  | "usage_record_failed"

const failureMessages: Record<AgentFailureCode, string> = {
  image_failed: "Agent image preparation failed",
  memory_commit_deferred: "Agent memory commit deferred",
  model_failed: "Agent model response failed",
  resume_failed: "Agent action resume failed",
  run_grant_invalid: "Agent run grant validation failed",
  run_start_failed: "Agent run start failed",
  title_failed: "Agent thread title generation failed",
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
  return (code: AgentFailureCode, error?: unknown): void => {
    if (!resource) return
    const recorded =
      error instanceof Error
        ? error
        : new Error(
            error === undefined
              ? failureMessages[code]
              : typeof error === "string"
                ? error
                : JSON.stringify(error)
          )
    const span = trace.getActiveSpan()
    span?.recordException(recorded)
    span?.setStatus({ code: SpanStatusCode.ERROR, message: code })
    logs.getLogger("enterprise-agentic-saas-agent").emit({
      attributes: {
        ...resource,
        component: "agent-worker",
        "error.code": code,
        "exception.message": recorded.message,
        "exception.stacktrace": recorded.stack ?? "",
      },
      body: failureMessages[code],
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
    })
  }
}
