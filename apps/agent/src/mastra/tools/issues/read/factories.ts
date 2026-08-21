import {
  agentGetIssueToolOutputSchema,
  emptyToolInputSchema,
  getIssueToolInputSchema,
  issueSearchToolInputSchema,
  issueSearchToolOutputSchema,
  labelSearchToolInputSchema,
  labelSearchToolOutputSchema,
  memberSearchToolInputSchema,
  memberSearchToolOutputSchema,
  readAccountContextToolOutputSchema,
  readActiveOrganizationToolOutputSchema,
  readIssueAttachmentImageToolInputSchema,
  type AgentAccountContext,
  type AgentIssue,
  type AgentIssueDetail,
  type AgentIssueLabel,
  type AgentMember,
  type AgentOrganizationContext,
  type GetIssueToolInput,
  type IssueSearchToolInput,
  type LabelSearchToolInput,
  type MemberSearchToolInput,
  type ReadIssueAttachmentImageToolInput,
  type ReadIssueAttachmentImageToolResult,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

import {
  type AgentToolExecutor,
  parseAgentToolValue,
  safeAgentToolExecution,
} from "../tool-runtime"

const emptyInputSchema = toStandardJsonSchema(emptyToolInputSchema)
const accountOutputSchema = toStandardJsonSchema(
  readAccountContextToolOutputSchema
)
const organizationOutputSchema = toStandardJsonSchema(
  readActiveOrganizationToolOutputSchema
)
const memberInputSchema = toStandardJsonSchema(memberSearchToolInputSchema)
const memberOutputSchema = toStandardJsonSchema(memberSearchToolOutputSchema)
const labelInputSchema = toStandardJsonSchema(labelSearchToolInputSchema)
const labelOutputSchema = toStandardJsonSchema(labelSearchToolOutputSchema)
const issueSearchInputSchema = toStandardJsonSchema(issueSearchToolInputSchema)
const issueSearchOutputSchema = toStandardJsonSchema(
  issueSearchToolOutputSchema
)
const getIssueProviderInputSchema = v.strictObject({
  lookup: v.picklist(["id", "number"]),
  id: v.optional(getIssueToolInputSchema.options[0].entries.id),
  number: v.optional(getIssueToolInputSchema.options[1].entries.number),
  attachmentCursor: getIssueToolInputSchema.options[0].entries.attachmentCursor,
  attachmentLimit: getIssueToolInputSchema.options[0].entries.attachmentLimit,
})
const getIssueInputSchema = toStandardJsonSchema(getIssueProviderInputSchema)
const getIssueOutputSchema = toStandardJsonSchema(agentGetIssueToolOutputSchema)
const imageInputSchema = toStandardJsonSchema(
  readIssueAttachmentImageToolInputSchema
)

export const createReadAccountContextTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<unknown, AgentAccountContext, RequestContextData>
) =>
  createTool<
    "read_account_context",
    typeof emptyInputSchema,
    typeof accountOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "read_account_context",
    description:
      "Read the current user's allowlisted display profile. This never returns credentials or account settings.",
    inputSchema: emptyInputSchema,
    outputSchema: accountOutputSchema,
    strict: true,
    execute: (_input, context) =>
      safeAgentToolExecution(async () =>
        parseAgentToolValue(
          readAccountContextToolOutputSchema,
          await executor(
            {},
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
            }
          )
        )
      ),
  })

export const createReadActiveOrganizationTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    unknown,
    AgentOrganizationContext,
    RequestContextData
  >
) =>
  createTool<
    "read_active_organization",
    typeof emptyInputSchema,
    typeof organizationOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "read_active_organization",
    description:
      "Read the active organization's allowlisted name, role, and Issue permissions without changing it.",
    inputSchema: emptyInputSchema,
    outputSchema: organizationOutputSchema,
    strict: true,
    execute: (_input, context) =>
      safeAgentToolExecution(async () =>
        parseAgentToolValue(
          readActiveOrganizationToolOutputSchema,
          await executor(
            {},
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
            }
          )
        )
      ),
  })

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
    typeof memberInputSchema,
    typeof memberOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "search_organization_members",
    description:
      "Search a bounded list of members in the active organization. Email and credentials are never returned.",
    inputSchema: memberInputSchema,
    outputSchema: memberOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const parsedInput = parseAgentToolValue(
          memberSearchToolInputSchema,
          input
        )
        return parseAgentToolValue(
          memberSearchToolOutputSchema,
          await executor(
            { ...parsedInput, query: parsedInput.query?.trim() },
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
            }
          )
        )
      }),
  })

export const createSearchIssueLabelsTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    LabelSearchToolInput,
    AgentIssueLabel[],
    RequestContextData
  >
) =>
  createTool<
    "search_issue_labels",
    typeof labelInputSchema,
    typeof labelOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "search_issue_labels",
    description:
      "Search bounded label candidates from Issues in the active organization.",
    inputSchema: labelInputSchema,
    outputSchema: labelOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const parsedInput = parseAgentToolValue(
          labelSearchToolInputSchema,
          input
        )
        return parseAgentToolValue(
          labelSearchToolOutputSchema,
          await executor(
            { ...parsedInput, query: parsedInput.query?.trim() },
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
            }
          )
        )
      }),
  })

export const createSearchIssuesTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    IssueSearchToolInput,
    AgentIssue[],
    RequestContextData
  >
) =>
  createTool<
    "search_issues",
    typeof issueSearchInputSchema,
    typeof issueSearchOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "search_issues",
    description:
      "Search a bounded, stable first page of Issues in the active organization using typed filters.",
    inputSchema: issueSearchInputSchema,
    outputSchema: issueSearchOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const parsedInput = parseAgentToolValue(
          issueSearchToolInputSchema,
          input
        )
        return parseAgentToolValue(
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
      }),
  })

export const createGetIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    GetIssueToolInput,
    AgentIssueDetail,
    RequestContextData
  >
) =>
  createTool<
    "get_issue",
    typeof getIssueInputSchema,
    typeof getIssueOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "get_issue",
    description:
      'Read one Issue in the active organization. For Issue #N use {"lookup":"number","number":N}; for an opaque ID use {"lookup":"id","id":"..."}.',
    inputSchema: getIssueInputSchema,
    outputSchema: getIssueOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () =>
        parseAgentToolValue(
          agentGetIssueToolOutputSchema,
          await executor(parseAgentToolValue(getIssueToolInputSchema, input), {
            abortSignal: context.abortSignal,
            requestContext: context.requestContext,
          })
        )
      ),
  })

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
    typeof imageInputSchema,
    undefined,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "read_issue_attachment_image",
    description:
      "Read one supported JPEG, PNG, WebP, or GIF attachment from an Issue when its visual contents are needed. Call get_issue first and use only an attachment marked imageReadable.",
    inputSchema: imageInputSchema,
    strict: true,
    execute: (input, context) =>
      executor(
        parseAgentToolValue(readIssueAttachmentImageToolInputSchema, input),
        {
          abortSignal: context.abortSignal,
          requestContext: context.requestContext,
          toolCallId: context.agent?.toolCallId,
        }
      ),
    // An output schema may clone this metadata object and break the Agent-local
    // WeakMap sidecar. The runtime owns validation and byte projection.
    toModelOutput,
  })
