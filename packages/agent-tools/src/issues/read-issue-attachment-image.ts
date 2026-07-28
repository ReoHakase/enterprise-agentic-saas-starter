import {
  readIssueAttachmentImageToolInputSchema,
  type ReadIssueAttachmentImageToolInput,
  type ReadIssueAttachmentImageToolResult,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"

import type { AgentToolExecutor } from "../executor"
import { parseToolValue } from "../validation"

const inputSchema = toStandardJsonSchema(
  readIssueAttachmentImageToolInputSchema
)

export const createReadIssueAttachmentImageTool = <
  RequestContextData = unknown,
  Result extends ReadIssueAttachmentImageToolResult =
    ReadIssueAttachmentImageToolResult,
>(
  executor: AgentToolExecutor<
    ReadIssueAttachmentImageToolInput,
    Result,
    RequestContextData
  >,
  toModelOutput: (
    output: unknown
  ) => ReturnType<
    NonNullable<Parameters<typeof createTool>[0]["toModelOutput"]>
  >
) =>
  createTool<
    "read_issue_attachment_image",
    typeof inputSchema,
    undefined,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "read_issue_attachment_image",
    description:
      "Read one supported JPEG, PNG, WebP, or GIF attachment from an Issue when its visual contents are needed. Call get_issue first and use only an attachment marked imageReadable.",
    inputSchema,
    strict: true,
    mcp: {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    },
    execute: (input, context) =>
      executor(parseToolValue(readIssueAttachmentImageToolInputSchema, input), {
        abortSignal: context.abortSignal,
        requestContext: context.requestContext,
        toolCallId: context.agent?.toolCallId,
      }),
    // An output schema may clone this metadata object and break an app-local
    // WeakMap sidecar. The consumer owns validation and byte projection.
    toModelOutput,
  })
