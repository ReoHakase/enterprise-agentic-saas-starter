import {
  addIssueAttachmentsToolInputSchema,
  addAttachmentWriteToolOutputSchema,
  addAttachmentWriteToolProviderOutputSchema,
  type AddIssueAttachmentsToolInput,
  type AddAttachmentWriteToolOutput,
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
    assetIds: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(130))),
      v.minLength(1),
      v.maxLength(4)
    ),
  })
)
const outputSchema = toStandardJsonSchema(
  addAttachmentWriteToolProviderOutputSchema
)

export const createAddIssueAttachmentsTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    AddIssueAttachmentsToolInput,
    AddAttachmentWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "add_issue_attachments",
    typeof providerInputSchema,
    typeof outputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "add_issue_attachments",
    description:
      "Prepare adding up to four staged images to an existing Issue at its expected revision.",
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
          addAttachmentWriteToolOutputSchema,
          await executor(
            parseToolValue(addIssueAttachmentsToolInputSchema, input),
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
