import type { RequestContext } from "@mastra/core/request-context"
import * as v from "valibot"

type AgentToolExecutionContext<RequestContextData = unknown> = {
  abortSignal?: AbortSignal
  requestContext: RequestContext<RequestContextData>
  toolCallId?: string
}

export type AgentToolExecutor<Input, Output, RequestContextData = unknown> = (
  input: Input,
  context: AgentToolExecutionContext<RequestContextData>
) => Promise<Output>

export const parseAgentToolValue = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  value: unknown
): v.InferOutput<TSchema> => {
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) throw new Error("Agent tool execution failed")
  return parsed.output
}

export const safeAgentToolExecution = async <Output>(
  operation: () => Promise<Output>
): Promise<Output> => {
  try {
    return await operation()
  } catch (cause) {
    throw new Error("Agent tool execution failed", { cause })
  }
}
