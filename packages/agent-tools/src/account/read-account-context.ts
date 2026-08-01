import {
  emptyToolInputSchema,
  readAccountContextToolOutputSchema,
  type AgentAccountContext,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"

const inputSchema = toStandardJsonSchema(emptyToolInputSchema)
const outputSchema = toStandardJsonSchema(readAccountContextToolOutputSchema)

export const createReadAccountContextTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<unknown, AgentAccountContext, RequestContextData>
) =>
  createTool<
    "read_account_context",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "read_account_context",
    description:
      "Read the current user's allowlisted display profile. This never returns credentials or account settings.",
    inputSchema,
    outputSchema,
    strict: true,
    mcp: {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    },
    execute: async (_input, context) => {
      try {
        return parseToolValue(
          readAccountContextToolOutputSchema,
          await executor(
            {},
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
            }
          )
        )
      } catch (cause) {
        throw new Error("Agent tool execution failed", { cause })
      }
    },
  })
