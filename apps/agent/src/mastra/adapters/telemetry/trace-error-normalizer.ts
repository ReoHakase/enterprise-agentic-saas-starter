import type { AnySpan, SpanOutputProcessor } from "@mastra/core/observability"
import { SpanType } from "@mastra/core/observability"

const modelSpanTypes = new Set<SpanType>([
  SpanType.MODEL_CHUNK,
  SpanType.MODEL_GENERATION,
  SpanType.MODEL_INFERENCE,
  SpanType.MODEL_STEP,
])
const toolSpanTypes = new Set<SpanType>([
  SpanType.CLIENT_TOOL_CALL,
  SpanType.MCP_TOOL_CALL,
  SpanType.PROVIDER_TOOL_CALL,
  SpanType.TOOL_CALL,
])
const workflowSpanTypes = new Set<SpanType>([
  SpanType.WORKFLOW_CONDITIONAL,
  SpanType.WORKFLOW_CONDITIONAL_EVAL,
  SpanType.WORKFLOW_LOOP,
  SpanType.WORKFLOW_PARALLEL,
  SpanType.WORKFLOW_RUN,
  SpanType.WORKFLOW_SLEEP,
  SpanType.WORKFLOW_STEP,
  SpanType.WORKFLOW_WAIT_EVENT,
])
const fixedErrorCodes = new Set([
  "agent_runtime_failed",
  "connection_failed",
  "image_failed",
  "internal_error",
  "memory_failed",
  "model_failed",
  "processor_failed",
  "response_stream_failed",
  "resume_failed",
  "resume_storage_close_failed",
  "run_finalization_failed",
  "run_grant_invalid",
  "run_settlement_failed",
  "run_start_failed",
  "storage_failed",
  "telemetry_flush_failed",
  "tool_failed",
  "usage_record_failed",
  "workflow_failed",
])

const existingErrorCode = (span: AnySpan): string | undefined => {
  const value = Reflect.get(span.attributes ?? {}, "app.error.code")
  return typeof value === "string" && fixedErrorCodes.has(value)
    ? value
    : undefined
}

const errorCodeFor = (span: AnySpan): string => {
  const existing = existingErrorCode(span)
  if (existing) return existing
  if (span.type === SpanType.MEMORY_OPERATION) return "memory_failed"
  if (modelSpanTypes.has(span.type)) return "model_failed"
  if (toolSpanTypes.has(span.type)) return "tool_failed"
  if (workflowSpanTypes.has(span.type)) return "workflow_failed"
  if (span.type === SpanType.PROCESSOR_RUN) return "processor_failed"
  const operation = `${span.name} ${span.entityName ?? ""}`.toLowerCase()
  if (operation.includes("storage")) return "storage_failed"
  return "agent_runtime_failed"
}

export class AgentTraceErrorNormalizer implements SpanOutputProcessor {
  name = "agent-trace-error-normalizer"

  process(span?: AnySpan): AnySpan | undefined {
    if (!span?.errorInfo) return span
    const errorCode = errorCodeFor(span)
    span.errorInfo = {
      id: "agent_runtime_error",
      message: "Agent operation failed",
      name: "Error",
    }
    const attributes = { ...span.attributes }
    Reflect.set(attributes, "app.error.code", errorCode)
    span.attributes = attributes
    return span
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}
