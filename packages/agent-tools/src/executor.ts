import type { RequestContext } from "@mastra/core/request-context"

export type AgentToolExecutionContext<RequestContextData = unknown> = {
  abortSignal?: AbortSignal
  requestContext: RequestContext<RequestContextData>
}

export type AgentToolExecutor<Input, Output, RequestContextData = unknown> = (
  input: Input,
  context: AgentToolExecutionContext<RequestContextData>
) => Promise<Output>
