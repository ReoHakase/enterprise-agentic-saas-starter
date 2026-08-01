import {
  removeAttachmentWriteToolOutputSchema,
  removeAttachmentWriteToolProviderOutputSchema,
  removeIssueAttachmentsToolInputSchema,
  type RemoveAttachmentWriteToolOutput,
  type RemoveIssueAttachmentsToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"

const providerInputSchema = toStandardJsonSchema(
  v.strictObject({
    issueId: v.pipe(v.string(), v.minLength(1), v.maxLength(130)),
    expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    fileIds: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(130))),
      v.minLength(1),
      v.maxLength(20)
    ),
  })
)
const outputSchema = toStandardJsonSchema(
  removeAttachmentWriteToolProviderOutputSchema
)

export const createRemoveIssueAttachmentsTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    RemoveIssueAttachmentsToolInput,
    RemoveAttachmentWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "remove_issue_attachments",
    typeof providerInputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "remove_issue_attachments",
    description:
      "Prepare removing up to twenty ready attachments from an existing Issue at its expected revision.",
    inputSchema: providerInputSchema,
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
        const output = parseToolValue(
          removeAttachmentWriteToolOutputSchema,
          await executor(
            parseToolValue(removeIssueAttachmentsToolInputSchema, input),
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
              toolCallId,
            }
          )
        )
        return output
      } catch (cause) {
        throw new Error("Agent tool execution failed", { cause })
      }
    },
  })
