import {
  agentGetIssueToolOutputSchema,
  getIssueToolInputSchema,
  type AgentIssueDetail,
  type GetIssueToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

import type { AgentToolExecutor } from "../executor"

const getIssueInputJsonSchema = toStandardJsonSchema(getIssueToolInputSchema)
const agentIssueDetailJsonSchema = toStandardJsonSchema(
  agentGetIssueToolOutputSchema
)

export const createGetIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    GetIssueToolInput,
    AgentIssueDetail,
    RequestContextData
  >
) =>
  createTool<
    "get_issue",
    typeof getIssueInputJsonSchema,
    typeof agentIssueDetailJsonSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "get_issue",
    description:
      'Read one Issue in the active organization. For Issue #N use {"lookup":"number","number":N}; for an opaque ID use {"lookup":"id","id":"..."}.',
    inputSchema: getIssueInputJsonSchema,
    outputSchema: agentIssueDetailJsonSchema,
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
        const output = await executor(input, {
          abortSignal: context.abortSignal,
          requestContext: context.requestContext,
        })
        const validated = v.safeParse(agentGetIssueToolOutputSchema, output)
        if (!validated.success) throw new Error("Invalid tool output")
        return validated.output
      } catch {
        throw new Error("Agent tool execution failed")
      }
    },
  })
