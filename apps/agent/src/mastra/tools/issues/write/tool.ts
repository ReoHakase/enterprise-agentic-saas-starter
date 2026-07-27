import {
  createCreateIssueTool,
  createDeleteIssueTool,
  createUpdateIssueTool,
} from "@enterprise-agentic-saas/agent-tools"

import {
  type ProductAgentExecutionResolver,
  type ProductAgentRequestContext,
} from "../../../runtime/request-context"
import { createAgentWriteHandlers } from "./execute"

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

export const createIssueWriteTools = (
  resolveExecution: ProductAgentExecutionResolver
) => ({
  create_issue: createIssueTool(resolveExecution),
  delete_issue: deleteIssueTool(resolveExecution),
  update_issue: updateIssueTool(resolveExecution),
})
