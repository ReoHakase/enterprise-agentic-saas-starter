import {
  emptyToolInputSchema,
  readActiveOrganizationToolOutputSchema,
  type AgentOrganizationContext,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"

const inputSchema = toStandardJsonSchema(emptyToolInputSchema)
const outputSchema = toStandardJsonSchema(
  readActiveOrganizationToolOutputSchema
)

export const createReadActiveOrganizationTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    unknown,
    AgentOrganizationContext,
    RequestContextData
  >
) =>
  createTool<
    "read_active_organization",
    typeof inputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "read_active_organization",
    description:
      "Read the active organization's allowlisted name, role, and Issue permissions without changing it.",
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
          readActiveOrganizationToolOutputSchema,
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
