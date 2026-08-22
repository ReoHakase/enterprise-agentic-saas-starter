import * as v from "valibot"

import { HttpError } from "../../errors/http-error"
import { createObservedLogger } from "../../platform/observability/runtime"
import {
  executeApprovedActionInputModel,
  prepareCreateIssueInputModel,
  prepareDeleteIssueInputModel,
  prepareUpdateIssueInputModel,
  resumeApprovedActionInputModel,
} from "./action-schema"
import type { AgentInternalPorts } from "./internal-ports"
import {
  agentGrantInputModel,
  authorizeAgentWebSearchInputModel,
  consumeConnectionTicketInputModel,
  finalizeAgentRunInputModel,
  getAgentImageInputModel,
  getAgentIssueAttachmentImageInputModel,
  getAgentIssueInputModel,
  searchAgentIssuesInputModel,
  searchAgentLabelsInputModel,
  searchAgentMembersInputModel,
  startAgentChatRunInputModel,
} from "./runtime-schema"

const connectionLogger = createObservedLogger("agent").child("connection")

const parseInternalInput = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, input)
  if (!result.success) {
    // Valibot issueには入力値が含まれ得る。HTTP境界へtokenを含むcauseを渡さない。
    throw new HttpError({ code: "validation_error" })
  }
  return result.output
}

export const createAgentInternalService = (ports: AgentInternalPorts) => ({
  assertRunLive(input: v.InferInput<typeof agentGrantInputModel>) {
    return ports.assertRunLive(parseInternalInput(agentGrantInputModel, input))
  },
  authorizeWebSearch(
    input: v.InferInput<typeof authorizeAgentWebSearchInputModel>
  ) {
    return ports.authorizeWebSearch(
      parseInternalInput(authorizeAgentWebSearchInputModel, input)
    )
  },
  async consumeConnectionTicket(
    input: v.InferInput<typeof consumeConnectionTicketInputModel>
  ) {
    const connection = await ports.consumeConnectionTicket(
      parseInternalInput(consumeConnectionTicketInputModel, input)
    )
    connectionLogger.info("Agent connection established", {
      "app.operation": "consumeAgentConnectionTicket",
      "app.outcome": "success",
      "agent.connection.organization_role": connection.organization.role,
      "agent.connection.allowed_action_count": Object.values(
        connection.organization.permissions
      ).filter(Boolean).length,
    })
    return connection
  },
  executeApprovedAction(
    input: v.InferInput<typeof executeApprovedActionInputModel>
  ) {
    return ports.executeApprovedAction(
      parseInternalInput(executeApprovedActionInputModel, input)
    )
  },
  finalizeRun(input: v.InferInput<typeof finalizeAgentRunInputModel>) {
    return ports.finalizeRun(
      parseInternalInput(finalizeAgentRunInputModel, input)
    )
  },
  getAgentImageForModel(input: v.InferInput<typeof getAgentImageInputModel>) {
    return ports.getAgentImageForModel(
      parseInternalInput(getAgentImageInputModel, input)
    )
  },
  getIssue(input: v.InferInput<typeof getAgentIssueInputModel>) {
    return ports.getIssue(parseInternalInput(getAgentIssueInputModel, input))
  },
  getIssueAttachmentImageForModel(
    input: v.InferInput<typeof getAgentIssueAttachmentImageInputModel>
  ) {
    return ports.getIssueAttachmentImageForModel(
      parseInternalInput(getAgentIssueAttachmentImageInputModel, input)
    )
  },
  prepareCreateIssue(input: v.InferInput<typeof prepareCreateIssueInputModel>) {
    return ports.prepareCreateIssue(
      parseInternalInput(prepareCreateIssueInputModel, input)
    )
  },
  prepareDeleteIssue(input: v.InferInput<typeof prepareDeleteIssueInputModel>) {
    return ports.prepareDeleteIssue(
      parseInternalInput(prepareDeleteIssueInputModel, input)
    )
  },
  prepareUpdateIssue(input: v.InferInput<typeof prepareUpdateIssueInputModel>) {
    return ports.prepareUpdateIssue(
      parseInternalInput(prepareUpdateIssueInputModel, input)
    )
  },
  readAccountContext(input: v.InferInput<typeof agentGrantInputModel>) {
    return ports.readAccountContext(
      parseInternalInput(agentGrantInputModel, input)
    )
  },
  readActiveOrganization(input: v.InferInput<typeof agentGrantInputModel>) {
    return ports.readActiveOrganization(
      parseInternalInput(agentGrantInputModel, input)
    )
  },
  resumeApprovedAction(
    input: v.InferInput<typeof resumeApprovedActionInputModel>
  ) {
    return ports.resumeApprovedAction(
      parseInternalInput(resumeApprovedActionInputModel, input)
    )
  },
  searchIssueLabels(input: v.InferInput<typeof searchAgentLabelsInputModel>) {
    return ports.searchIssueLabels(
      parseInternalInput(searchAgentLabelsInputModel, input)
    )
  },
  searchIssues(input: v.InferInput<typeof searchAgentIssuesInputModel>) {
    return ports.searchIssues(
      parseInternalInput(searchAgentIssuesInputModel, input)
    )
  },
  searchOrganizationMembers(
    input: v.InferInput<typeof searchAgentMembersInputModel>
  ) {
    return ports.searchOrganizationMembers(
      parseInternalInput(searchAgentMembersInputModel, input)
    )
  },
  async startChatRun(input: v.InferInput<typeof startAgentChatRunInputModel>) {
    const chatRun = await ports.startChatRun(
      parseInternalInput(startAgentChatRunInputModel, input)
    )
    connectionLogger.info("Agent chat run started", {
      "app.operation": "startAgentChatRun",
      "app.outcome": "success",
      "agent.connection.organization_role": chatRun.organization.role,
      "agent.connection.allowed_action_count": Object.values(
        chatRun.organization.permissions
      ).filter(Boolean).length,
    })
    return chatRun
  },
})

export type AgentInternalService = ReturnType<typeof createAgentInternalService>
