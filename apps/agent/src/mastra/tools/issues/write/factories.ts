import {
  addAttachmentWriteToolOutputSchema,
  addAttachmentWriteToolProviderOutputSchema,
  addIssueAttachmentsToolInputSchema,
  agentCreateIssueActionInputSchema,
  agentDeleteIssueActionInputSchema,
  agentUpdateIssueActionInputSchema,
  createIssueToolInputSchema,
  deleteIssueToolInputSchema,
  issueWriteToolOutputSchema,
  issueWriteToolProviderOutputSchema,
  removeAttachmentWriteToolOutputSchema,
  removeAttachmentWriteToolProviderOutputSchema,
  removeIssueAttachmentsToolInputSchema,
  updateIssueToolInputSchema,
  type AddAttachmentWriteToolOutput,
  type AddIssueAttachmentsToolInput,
  type CreateIssueToolInput,
  type DeleteIssueToolInput,
  type IssueWriteToolOutput,
  type RemoveAttachmentWriteToolOutput,
  type RemoveIssueAttachmentsToolInput,
  type UpdateIssueToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { createTool } from "@mastra/core/tools"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

import {
  type AgentToolExecutor,
  parseAgentToolValue,
  safeAgentToolExecution,
} from "../tool-runtime"

const createInputSchema = toStandardJsonSchema(createIssueToolInputSchema)
const updateInputSchema = toStandardJsonSchema(updateIssueToolInputSchema)
const deleteInputSchema = toStandardJsonSchema(deleteIssueToolInputSchema)
const issueWriteOutputSchema = toStandardJsonSchema(
  issueWriteToolProviderOutputSchema
)
const addAttachmentInputSchema = toStandardJsonSchema(
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
const addAttachmentOutputSchema = toStandardJsonSchema(
  addAttachmentWriteToolProviderOutputSchema
)
const removeAttachmentInputSchema = toStandardJsonSchema(
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
const removeAttachmentOutputSchema = toStandardJsonSchema(
  removeAttachmentWriteToolProviderOutputSchema
)

const normalizeLabels = (labels?: string[]) =>
  labels === undefined
    ? undefined
    : [...new Set(labels.map((label) => label.trim()))]

const normalizeAssignee = (assigneeId?: string | null) =>
  typeof assigneeId === "string" ? assigneeId.trim() || null : assigneeId

const normalizeCreateIssueToolInput = (input: CreateIssueToolInput) =>
  parseAgentToolValue(agentCreateIssueActionInputSchema, {
    ...input,
    assigneeId: normalizeAssignee(input.assigneeId),
    attachmentAssetIds: [...new Set(input.attachmentAssetIds ?? [])],
    labels: normalizeLabels(input.labels),
    title: input.title.trim(),
  })

const normalizeUpdateIssueToolInput = (input: UpdateIssueToolInput) => {
  const changedFields = [
    "assigneeId",
    "description",
    "dueDate",
    "labels",
    "priority",
    "status",
    "title",
  ] as const
  if (!changedFields.some((field) => Object.hasOwn(input, field))) {
    throw new Error("Agent tool execution failed")
  }
  return parseAgentToolValue(agentUpdateIssueActionInputSchema, {
    ...input,
    assigneeId: normalizeAssignee(input.assigneeId),
    issueId: input.issueId.trim(),
    labels: normalizeLabels(input.labels),
    title: input.title?.trim(),
  })
}

const normalizeDeleteIssueToolInput = (input: DeleteIssueToolInput) =>
  parseAgentToolValue(agentDeleteIssueActionInputSchema, {
    ...input,
    issueId: input.issueId.trim(),
  })

export const createCreateIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    CreateIssueToolInput,
    IssueWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "create_issue",
    typeof createInputSchema,
    typeof issueWriteOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "create_issue",
    description:
      "Prepare an Issue creation in the active organization. It may return a canonical preview that requires human approval before execution.",
    inputSchema: createInputSchema,
    outputSchema: issueWriteOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const toolCallId = context.agent?.toolCallId
        if (!toolCallId) throw new Error("Agent tool execution failed")
        return parseAgentToolValue(
          issueWriteToolOutputSchema,
          await executor(normalizeCreateIssueToolInput(input), {
            abortSignal: context.abortSignal,
            requestContext: context.requestContext,
            toolCallId,
          })
        )
      }),
  })

export const createUpdateIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    UpdateIssueToolInput,
    IssueWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "update_issue",
    typeof updateInputSchema,
    typeof issueWriteOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "update_issue",
    description:
      "Prepare an allowlisted Issue field update at its expected revision. It may require human approval.",
    inputSchema: updateInputSchema,
    outputSchema: issueWriteOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const toolCallId = context.agent?.toolCallId
        if (!toolCallId) throw new Error("Agent tool execution failed")
        return parseAgentToolValue(
          issueWriteToolOutputSchema,
          await executor(normalizeUpdateIssueToolInput(input), {
            abortSignal: context.abortSignal,
            requestContext: context.requestContext,
            toolCallId,
          })
        )
      }),
  })

export const createDeleteIssueTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    DeleteIssueToolInput,
    IssueWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "delete_issue",
    typeof deleteInputSchema,
    typeof issueWriteOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "delete_issue",
    description:
      "Prepare deletion of one Issue at its expected revision. Deletion requires approval unless an explicit auto-all policy is active.",
    inputSchema: deleteInputSchema,
    outputSchema: issueWriteOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const toolCallId = context.agent?.toolCallId
        if (!toolCallId) throw new Error("Agent tool execution failed")
        return parseAgentToolValue(
          issueWriteToolOutputSchema,
          await executor(normalizeDeleteIssueToolInput(input), {
            abortSignal: context.abortSignal,
            requestContext: context.requestContext,
            toolCallId,
          })
        )
      }),
  })

export const createAddIssueAttachmentsTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    AddIssueAttachmentsToolInput,
    AddAttachmentWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "add_issue_attachments",
    typeof addAttachmentInputSchema,
    typeof addAttachmentOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "add_issue_attachments",
    description:
      "Prepare adding up to four staged images to an existing Issue at its expected revision.",
    inputSchema: addAttachmentInputSchema,
    outputSchema: addAttachmentOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const toolCallId = context.agent?.toolCallId
        if (!toolCallId) throw new Error("Agent tool execution failed")
        return parseAgentToolValue(
          addAttachmentWriteToolOutputSchema,
          await executor(
            parseAgentToolValue(addIssueAttachmentsToolInputSchema, input),
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
              toolCallId,
            }
          )
        )
      }),
  })

export const createRemoveIssueAttachmentsTool = <RequestContextData = unknown>(
  executor: AgentToolExecutor<
    RemoveIssueAttachmentsToolInput,
    RemoveAttachmentWriteToolOutput,
    RequestContextData
  >
) =>
  createTool<
    "remove_issue_attachments",
    typeof removeAttachmentInputSchema,
    typeof removeAttachmentOutputSchema,
    undefined,
    undefined,
    RequestContextData
  >({
    id: "remove_issue_attachments",
    description:
      "Prepare removing up to twenty ready attachments from an existing Issue at its expected revision.",
    inputSchema: removeAttachmentInputSchema,
    outputSchema: removeAttachmentOutputSchema,
    strict: true,
    execute: (input, context) =>
      safeAgentToolExecution(async () => {
        const toolCallId = context.agent?.toolCallId
        if (!toolCallId) throw new Error("Agent tool execution failed")
        return parseAgentToolValue(
          removeAttachmentWriteToolOutputSchema,
          await executor(
            parseAgentToolValue(removeIssueAttachmentsToolInputSchema, input),
            {
              abortSignal: context.abortSignal,
              requestContext: context.requestContext,
              toolCallId,
            }
          )
        )
      }),
  })
