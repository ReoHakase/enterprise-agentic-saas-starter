import {
  deleteIssueToolInputSchema,
  issueWriteToolOutputSchema,
  issueWriteToolProviderOutputSchema,
  type DeleteIssueToolInput,
  type IssueWriteToolOutput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"
import { normalizeDeleteIssueToolInput } from "./write-normalize"

const inputSchema = toStandardJsonSchema(deleteIssueToolInputSchema)
const outputSchema = toStandardJsonSchema(issueWriteToolProviderOutputSchema)

export const createDeleteIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    DeleteIssueToolInput,
    IssueWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "delete_issue",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "delete_issue",
    description:
      "Prepare deletion of one Issue at its expected revision. Deletion requires approval unless an explicit auto-all policy is active.",
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
          await executor(normalizeDeleteIssueToolInput(input), {
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
