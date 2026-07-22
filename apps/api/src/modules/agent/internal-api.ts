import type { Db } from "@enterprise-agentic-saas/db"
import * as v from "valibot"

import type { AgentInternalApiContract } from "../../agent-client"
import { publicErrors } from "../../errors/app-error"
import { getAgentImageForModel } from "../files/agent-assets-service"
import {
  executeAgentApprovedAction,
  getAgentIssueActionDecision,
  prepareCreateIssueAction,
  prepareDeleteIssueAction,
  prepareUpdateIssueAction,
  resumeAgentApprovedAction,
} from "./action-repository"
import {
  agentGrantInputModel,
  consumeConnectionTicketInputModel,
  executeApprovedActionInputModel,
  finishAgentRunInputModel,
  getAgentImageInputModel,
  getAgentIssueInputModel,
  getIssueActionDecisionInputModel,
  prepareCreateIssueInputModel,
  prepareDeleteIssueInputModel,
  prepareUpdateIssueInputModel,
  resumeApprovedActionInputModel,
  searchAgentIssuesInputModel,
  searchAgentLabelsInputModel,
  searchAgentMembersInputModel,
  startAgentRunInputModel,
} from "./model"
import {
  cancelAgentRun,
  consumeAgentConnectionTicket,
  finishAgentRun,
  getAgentIssue,
  readAgentAccountContext,
  readAgentActiveOrganization,
  searchAgentIssueLabels,
  searchAgentIssues,
  searchAgentOrganizationMembers,
  startAgentRun,
} from "./repository"

const parseInternalInput = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, input)
  if (!result.success) {
    // Valibot issueには入力値が含まれ得る。RPC境界へtokenを含むcauseを渡さない。
    throw publicErrors.validation("Invalid agent request")
  }
  return result.output
}

export const createAgentInternalApi = (db: Db): AgentInternalApiContract => ({
  consumeConnectionTicket(input) {
    return consumeAgentConnectionTicket(
      db,
      parseInternalInput(consumeConnectionTicketInputModel, input)
    )
  },
  startRun(input) {
    return startAgentRun(db, parseInternalInput(startAgentRunInputModel, input))
  },
  cancelRun(input) {
    return cancelAgentRun(db, parseInternalInput(agentGrantInputModel, input))
  },
  finishRun(input) {
    return finishAgentRun(
      db,
      parseInternalInput(finishAgentRunInputModel, input)
    )
  },
  readAccountContext(input) {
    return readAgentAccountContext(
      db,
      parseInternalInput(agentGrantInputModel, input)
    )
  },
  readActiveOrganization(input) {
    return readAgentActiveOrganization(
      db,
      parseInternalInput(agentGrantInputModel, input)
    )
  },
  searchOrganizationMembers(input) {
    return searchAgentOrganizationMembers(
      db,
      parseInternalInput(searchAgentMembersInputModel, input)
    )
  },
  searchIssueLabels(input) {
    return searchAgentIssueLabels(
      db,
      parseInternalInput(searchAgentLabelsInputModel, input)
    )
  },
  searchIssues(input) {
    return searchAgentIssues(
      db,
      parseInternalInput(searchAgentIssuesInputModel, input)
    )
  },
  getIssue(input) {
    return getAgentIssue(db, parseInternalInput(getAgentIssueInputModel, input))
  },
  prepareCreateIssue(input) {
    return prepareCreateIssueAction(
      db,
      parseInternalInput(prepareCreateIssueInputModel, input)
    )
  },
  prepareUpdateIssue(input) {
    return prepareUpdateIssueAction(
      db,
      parseInternalInput(prepareUpdateIssueInputModel, input)
    )
  },
  prepareDeleteIssue(input) {
    return prepareDeleteIssueAction(
      db,
      parseInternalInput(prepareDeleteIssueInputModel, input)
    )
  },
  getIssueActionDecision(input) {
    return getAgentIssueActionDecision(
      db,
      parseInternalInput(getIssueActionDecisionInputModel, input)
    )
  },
  resumeApprovedAction(input) {
    return resumeAgentApprovedAction(
      db,
      parseInternalInput(resumeApprovedActionInputModel, input)
    )
  },
  executeApprovedAction(input) {
    return executeAgentApprovedAction(
      db,
      parseInternalInput(executeApprovedActionInputModel, input)
    )
  },
  getAgentImageForModel(input) {
    return getAgentImageForModel(
      db,
      parseInternalInput(getAgentImageInputModel, input)
    )
  },
})
