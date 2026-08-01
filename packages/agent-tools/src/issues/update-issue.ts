import {
  issueWriteToolOutputSchema,
  issueWriteToolProviderOutputSchema,
  updateIssueToolInputSchema,
  type IssueWriteToolOutput,
  type UpdateIssueToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"
import { normalizeUpdateIssueToolInput } from "./write-normalize"

const inputSchema = toStandardJsonSchema(updateIssueToolInputSchema)
const outputSchema = toStandardJsonSchema(issueWriteToolProviderOutputSchema)

export const createUpdateIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    UpdateIssueToolInput,
    IssueWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "update_issue",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "update_issue",
    description:
      "Prepare an allowlisted Issue field update at its expected revision. It may require human approval.",
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
          await executor(normalizeUpdateIssueToolInput(input), {
            abortSignal: context.abortSignal,
            requestContext: context.requestContext,
            toolCallId,
          })
        )
      } catch (cause) {
        throw new Error("Agent tool execution failed", { cause })
      }
    },
  })
