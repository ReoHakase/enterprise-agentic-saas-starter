import {
  labelSearchToolInputSchema,
  labelSearchToolOutputSchema,
  type AgentIssueLabel,
  type LabelSearchToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"

const inputSchema = toStandardJsonSchema(labelSearchToolInputSchema)
const outputSchema = toStandardJsonSchema(labelSearchToolOutputSchema)

export const createSearchIssueLabelsTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    LabelSearchToolInput,
    AgentIssueLabel[],
    RequestContextData
  >
) =>
  createTool<
    "search_issue_labels",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "search_issue_labels",
    description:
      "Search bounded label candidates from Issues in the active organization.",
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
    execute: async (input, context) => {
      try {
        const parsedInput = parseToolValue(labelSearchToolInputSchema, input)
        return parseToolValue(
          labelSearchToolOutputSchema,
          await executor(
            {
              ...parsedInput,
              query: parsedInput.query?.trim(),
            },
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
            }
          )
        )
      } catch {
        throw new Error("Agent tool execution failed")
      }
    },
  })
