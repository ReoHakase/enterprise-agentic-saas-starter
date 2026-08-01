import {
  issueSearchToolInputSchema,
  issueSearchToolOutputSchema,
  type AgentIssue,
  type IssueSearchToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"

const inputSchema = toStandardJsonSchema(issueSearchToolInputSchema)
const outputSchema = toStandardJsonSchema(issueSearchToolOutputSchema)

export const createSearchIssuesTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    IssueSearchToolInput,
    AgentIssue[],
    RequestContextData
  >
) =>
  createTool<
    "search_issues",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "search_issues",
    description:
      "Search a bounded, stable first page of Issues in the active organization using typed filters.",
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
        const parsedInput = parseToolValue(issueSearchToolInputSchema, input)
        return parseToolValue(
          issueSearchToolOutputSchema,
          await executor(
            {
              ...parsedInput,
              label: parsedInput.label?.trim(),
              search: parsedInput.search?.trim(),
            },
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
