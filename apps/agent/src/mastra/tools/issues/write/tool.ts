import { createTool } from "@mastra/core/tools"

import {
  getProductAgentRuntime,
  type ProductAgentRequestContext,
} from "../../../runtime/request-context"
import { createAgentWriteHandlers } from "./execute"
import { agentWriteToolSchemas } from "./schema"

const writeToolMetadata = {
  annotations: {
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: false,
  },
}

const createIssueTool = createTool<
  "create_issue",
  typeof agentWriteToolSchemas.createIssue,
  undefined,
  undefined,
  undefined,
  ProductAgentRequestContext
>({
  id: "create_issue",
  description:
    "Prepare an Issue creation in the active organization. It may return a canonical preview that requires human approval before execution.",
  inputSchema: agentWriteToolSchemas.createIssue,
  strict: true,
  mcp: writeToolMetadata,
  execute: (input, context) => {
    const runtime = getProductAgentRuntime(context.requestContext)
    if (!runtime.writesEnabled || !context.agent?.toolCallId) {
      throw new Error("Issue write capability is unavailable")
    }
    return createAgentWriteHandlers(
      runtime.api,
      runtime.runGrant,
      runtime.budget,
      runtime.settlement,
      runtime.rootRunId
    ).createIssue(input, context.agent.toolCallId)
  },
})

const updateIssueTool = createTool<
  "update_issue",
  typeof agentWriteToolSchemas.updateIssue,
  undefined,
  undefined,
  undefined,
  ProductAgentRequestContext
>({
  id: "update_issue",
  description:
    "Prepare an allowlisted Issue field update at its expected revision. It may require human approval.",
  inputSchema: agentWriteToolSchemas.updateIssue,
  strict: true,
  mcp: writeToolMetadata,
  execute: (input, context) => {
    const runtime = getProductAgentRuntime(context.requestContext)
    if (!runtime.writesEnabled || !context.agent?.toolCallId) {
      throw new Error("Issue write capability is unavailable")
    }
    return createAgentWriteHandlers(
      runtime.api,
      runtime.runGrant,
      runtime.budget,
      runtime.settlement,
      runtime.rootRunId
    ).updateIssue(input, context.agent.toolCallId)
  },
})

const deleteIssueTool = createTool<
  "delete_issue",
  typeof agentWriteToolSchemas.deleteIssue,
  undefined,
  undefined,
  undefined,
  ProductAgentRequestContext
>({
  id: "delete_issue",
  description:
    "Prepare deletion of one Issue at its expected revision. Deletion requires approval unless an explicit auto-all policy is active.",
  inputSchema: agentWriteToolSchemas.deleteIssue,
  strict: true,
  mcp: writeToolMetadata,
  execute: (input, context) => {
    const runtime = getProductAgentRuntime(context.requestContext)
    if (!runtime.writesEnabled || !context.agent?.toolCallId) {
      throw new Error("Issue write capability is unavailable")
    }
    return createAgentWriteHandlers(
      runtime.api,
      runtime.runGrant,
      runtime.budget,
      runtime.settlement,
      runtime.rootRunId
    ).deleteIssue(input, context.agent.toolCallId)
  },
})

export const issueWriteTools = {
  create_issue: createIssueTool,
  delete_issue: deleteIssueTool,
  update_issue: updateIssueTool,
}
