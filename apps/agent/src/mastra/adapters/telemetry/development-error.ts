import { logs, SeverityNumber } from "@opentelemetry/api-logs"

type LocalTelemetryEnvironment = {
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  NODE_ENV?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
}

type DevelopmentErrorDependencies = {
  consoleError(message: string, error: unknown): void
  logError(
    message: string,
    attributes: Record<string, boolean | number | string>
  ): void
}

const defaultDependencies: DevelopmentErrorDependencies = {
  consoleError(message, error) {
    // 明示的に有効化したlocal developmentだけがprovider raw errorを出す。
    console.error(message, error)
  },
  logError(message, attributes) {
    logs.getLogger("enterprise-agentic-saas-agent").emit({
      attributes,
      body: message,
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
    })
  },
}

const nextCause = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("cause" in value)) {
    return undefined
  }
  return value.cause
}

export const reportDevelopmentCauseChain = (
  environment: LocalTelemetryEnvironment,
  label: string,
  cause: unknown,
  dependencies: DevelopmentErrorDependencies = defaultDependencies
): void => {
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
  if (!resource) return
  const seen = new Set<unknown>()
  let current: unknown = cause
  for (let depth = 0; depth < 5 && !seen.has(current); depth += 1) {
    seen.add(current)
    const error =
      current instanceof Error
        ? current
        : new Error(
            typeof current === "string" ? current : JSON.stringify(current)
          )
    const message = `[agent development] ${label} cause[${depth}]`
    dependencies.consoleError(message, error)
    dependencies.logError(message, {
      ...resource,
      component: "agent-provider",
      depth,
      "exception.message": error.message,
      "exception.stacktrace": error.stack ?? "",
      label,
    })
    const nested = nextCause(current)
    if (nested === undefined) return
    current = nested
  }
}
