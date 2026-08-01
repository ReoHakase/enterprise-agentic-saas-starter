import {
  memberSearchToolInputSchema,
  memberSearchToolOutputSchema,
  type AgentMember,
  type MemberSearchToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"

const inputSchema = toStandardJsonSchema(memberSearchToolInputSchema)
const outputSchema = toStandardJsonSchema(memberSearchToolOutputSchema)

export const createSearchOrganizationMembersTool = <
  RequestContextData = unknown,
>(
  executor: AgentToolExecutor<
    MemberSearchToolInput,
    AgentMember[],
    RequestContextData
  >
) =>
  createTool<
    "search_organization_members",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "search_organization_members",
    description:
      "Search a bounded list of members in the active organization. Email and credentials are never returned.",
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
        const parsedInput = parseToolValue(memberSearchToolInputSchema, input)
        return parseToolValue(
          memberSearchToolOutputSchema,
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
      } catch (cause) {
        throw new Error("Agent tool execution failed", { cause })
      }
    },
  })
