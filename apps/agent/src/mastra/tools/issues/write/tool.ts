import type {
  AddAttachmentWriteToolOutput,
  AttachmentWriteToolOutput,
  IssueWriteToolOutput,
  RemoveAttachmentWriteToolOutput,
} from "@enterprise-agentic-saas/agent-contracts"

import {
  type ProductAgentExecutionResolver,
  type ProductAgentRequestContext,
} from "../../../runtime/request-context"
import { createAgentWriteHandlers } from "./execute"
import {
  createAddIssueAttachmentsTool,
  createCreateIssueTool,
  createDeleteIssueTool,
  createRemoveIssueAttachmentsTool,
  createUpdateIssueTool,
} from "./factories"

const toAttachmentOutput = (
  result: IssueWriteToolOutput
): AttachmentWriteToolOutput => {
  if (result.status !== "succeeded") return result
  const mutation = result.issue.attachmentMutation
  if (!mutation) throw new Error("Issue write capability is unavailable")
  return {
    actionId: result.actionId,
    operation: mutation.operation,
    issueId: result.issue.id,
    issueNumber: result.issue.number,
    revision: result.issue.revision,
    fileIds: mutation.fileIds,
  }
}

const toAddAttachmentOutput = (
  result: IssueWriteToolOutput
): AddAttachmentWriteToolOutput => {
  const output = toAttachmentOutput(result)
  if (!("operation" in output)) return output
  if (output.operation !== "added") {
    throw new Error("Issue attachment operation mismatched")
  }
  return output
}

const toRemoveAttachmentOutput = (
  result: IssueWriteToolOutput
): RemoveAttachmentWriteToolOutput => {
  const output = toAttachmentOutput(result)
  if (!("operation" in output)) return output
  if (output.operation !== "removed") {
    throw new Error("Issue attachment operation mismatched")
  }
  return output
}

const createIssueTool = (resolveExecution: ProductAgentExecutionResolver) =>
  createCreateIssueTool<ProductAgentRequestContext>((input, context) => {
    const runtime = resolveExecution(context.requestContext)
    if (!context.toolCallId) {
      throw new Error("Issue write capability is unavailable")
    }
    return createAgentWriteHandlers(
      runtime.api,
      runtime.runGrant,
      runtime.budget,
      {
        holdForApproval: runtime.settlement.holdForApproval,
        suspendAction: runtime.suspendAction,
      },
      runtime.rootRunId
    ).createIssue(input, context.toolCallId)
  })

const addIssueAttachmentsTool = (
  resolveExecution: ProductAgentExecutionResolver
) =>
  createAddIssueAttachmentsTool<ProductAgentRequestContext>(
    (input, context) => {
      const runtime = resolveExecution(context.requestContext)
      if (!context.toolCallId) {
        throw new Error("Issue write capability is unavailable")
      }
      return createAgentWriteHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget,
        {
          holdForApproval: runtime.settlement.holdForApproval,
          suspendAction: runtime.suspendAction,
        },
        runtime.rootRunId
      )
        .addIssueAttachments(input, context.toolCallId)
        .then(toAddAttachmentOutput)
    }
  )

const updateIssueTool = (resolveExecution: ProductAgentExecutionResolver) =>
  createUpdateIssueTool<ProductAgentRequestContext>((input, context) => {
    const runtime = resolveExecution(context.requestContext)
    if (!context.toolCallId) {
      throw new Error("Issue write capability is unavailable")
    }
    return createAgentWriteHandlers(
      runtime.api,
      runtime.runGrant,
      runtime.budget,
      {
        holdForApproval: runtime.settlement.holdForApproval,
        suspendAction: runtime.suspendAction,
      },
      runtime.rootRunId
    ).updateIssue(input, context.toolCallId)
  })

const deleteIssueTool = (resolveExecution: ProductAgentExecutionResolver) =>
  createDeleteIssueTool<ProductAgentRequestContext>((input, context) => {
    const runtime = resolveExecution(context.requestContext)
    if (!context.toolCallId) {
      throw new Error("Issue write capability is unavailable")
    }
    return createAgentWriteHandlers(
      runtime.api,
      runtime.runGrant,
      runtime.budget,
      {
        holdForApproval: runtime.settlement.holdForApproval,
        suspendAction: runtime.suspendAction,
      },
      runtime.rootRunId
    ).deleteIssue(input, context.toolCallId)
  })

const removeIssueAttachmentsTool = (
  resolveExecution: ProductAgentExecutionResolver
) =>
  createRemoveIssueAttachmentsTool<ProductAgentRequestContext>(
    (input, context) => {
      const runtime = resolveExecution(context.requestContext)
      if (!context.toolCallId) {
        throw new Error("Issue write capability is unavailable")
      }
      return createAgentWriteHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget,
        {
          holdForApproval: runtime.settlement.holdForApproval,
          suspendAction: runtime.suspendAction,
        },
        runtime.rootRunId
      )
        .removeIssueAttachments(input, context.toolCallId)
        .then(toRemoveAttachmentOutput)
    }
  )

export const createIssueWriteTools = (
  resolveExecution: ProductAgentExecutionResolver
) => ({
  add_issue_attachments: addIssueAttachmentsTool(resolveExecution),
  create_issue: createIssueTool(resolveExecution),
  delete_issue: deleteIssueTool(resolveExecution),
  remove_issue_attachments: removeIssueAttachmentsTool(resolveExecution),
  update_issue: updateIssueTool(resolveExecution),
})
