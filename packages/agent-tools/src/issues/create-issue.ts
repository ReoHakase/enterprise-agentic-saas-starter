import {
  createIssueToolInputSchema,
  issueWriteToolOutputSchema,
  type CreateIssueToolInput,
  type IssueWriteToolOutput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"
import { normalizeCreateIssueToolInput } from "./write-normalize"

const inputSchema = toStandardJsonSchema(createIssueToolInputSchema)
const outputSchema = toStandardJsonSchema(issueWriteToolOutputSchema)

export const createCreateIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    CreateIssueToolInput,
    IssueWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "create_issue",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "create_issue",
    description:
      "Prepare an Issue creation in the active organization. It may return a canonical preview that requires human approval before execution.",
    inputSchema,
    outputSchema,
    strict: true,
    mcp: {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
    },
    execute: async (input, context) => {
      try {
        const toolCallId = context.agent?.toolCallId
        if (!toolCallId) throw new Error("Agent tool execution failed")
        return parseToolValue(
          issueWriteToolOutputSchema,
          await executor(normalizeCreateIssueToolInput(input), {
            abortSignal: context.abortSignal,
            requestContext: context.requestContext,
            toolCallId,
          })
        )
      } catch {
        throw new Error("Agent tool execution failed")
      }
    },
  })
