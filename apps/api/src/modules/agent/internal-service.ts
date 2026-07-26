import * as v from "valibot"

import { publicErrors } from "../../errors/app-error"
import {
  executeApprovedActionInputModel,
  getIssueActionDecisionInputModel,
  prepareCreateIssueInputModel,
  prepareDeleteIssueInputModel,
  prepareUpdateIssueInputModel,
  resumeApprovedActionInputModel,
} from "./action-schema"
import type { AgentInternalPorts } from "./internal-ports"
import {
  agentGrantInputModel,
  appendAgentRunMessagesInputModel,
  consumeConnectionTicketInputModel,
  finishAgentRunInputModel,
  getAgentImageInputModel,
  getAgentIssueAttachmentImageInputModel,
  getAgentIssueInputModel,
  guardAgentWebSearchInputModel,
  recordAgentUsageInputModel,
  renameAgentThreadInputModel,
  reserveAgentWebSearchInputModel,
  searchAgentIssuesInputModel,
  searchAgentLabelsInputModel,
  searchAgentMembersInputModel,
  startAgentRunInputModel,
} from "./runtime-schema"

const parseInternalInput = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, input)
  if (!result.success) {
    // Valibot issueには入力値が含まれ得る。HTTP境界へtokenを含むcauseを渡さない。
    throw publicErrors.validation("Invalid agent request")
  }
  return result.output
}

export const createAgentInternalService = (ports: AgentInternalPorts) => ({
  appendRunMessages(
    input: v.InferInput<typeof appendAgentRunMessagesInputModel>
  ) {
    return ports.appendRunMessages(
      parseInternalInput(appendAgentRunMessagesInputModel, input)
    )
  },
  cancelRun(input: v.InferInput<typeof agentGrantInputModel>) {
    return ports.cancelRun(parseInternalInput(agentGrantInputModel, input))
  },
  consumeConnectionTicket(
    input: v.InferInput<typeof consumeConnectionTicketInputModel>
  ) {
    return ports.consumeConnectionTicket(
      parseInternalInput(consumeConnectionTicketInputModel, input)
    )
  },
  executeApprovedAction(
    input: v.InferInput<typeof executeApprovedActionInputModel>
  ) {
    return ports.executeApprovedAction(
      parseInternalInput(executeApprovedActionInputModel, input)
    )
  },
  finishRun(input: v.InferInput<typeof finishAgentRunInputModel>) {
    return ports.finishRun(parseInternalInput(finishAgentRunInputModel, input))
  },
  getAgentImageForModel(input: v.InferInput<typeof getAgentImageInputModel>) {
    return ports.getAgentImageForModel(
      parseInternalInput(getAgentImageInputModel, input)
    )
  },
  getIssue(input: v.InferInput<typeof getAgentIssueInputModel>) {
    return ports.getIssue(parseInternalInput(getAgentIssueInputModel, input))
  },
  getIssueActionDecision(
    input: v.InferInput<typeof getIssueActionDecisionInputModel>
  ) {
    return ports.getIssueActionDecision(
      parseInternalInput(getIssueActionDecisionInputModel, input)
    )
  },
  getIssueAttachmentImageForModel(
    input: v.InferInput<typeof getAgentIssueAttachmentImageInputModel>
  ) {
    return ports.getIssueAttachmentImageForModel(
      parseInternalInput(getAgentIssueAttachmentImageInputModel, input)
    )
  },
  guardWebSearch(input: v.InferInput<typeof guardAgentWebSearchInputModel>) {
    return ports.guardWebSearch(
      parseInternalInput(guardAgentWebSearchInputModel, input)
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
  recordUsage(input: v.InferInput<typeof recordAgentUsageInputModel>) {
    return ports.recordUsage(
      parseInternalInput(recordAgentUsageInputModel, input)
    )
  },
  renameThread(input: v.InferInput<typeof renameAgentThreadInputModel>) {
    return ports.renameThread(
      parseInternalInput(renameAgentThreadInputModel, input)
    )
  },
  reserveWebSearch(
    input: v.InferInput<typeof reserveAgentWebSearchInputModel>
  ) {
    return ports.reserveWebSearch(
      parseInternalInput(reserveAgentWebSearchInputModel, input)
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
  startRun(input: v.InferInput<typeof startAgentRunInputModel>) {
    return ports.startRun(parseInternalInput(startAgentRunInputModel, input))
  },
})

export type AgentInternalService = ReturnType<typeof createAgentInternalService>
