import type { Db } from "@enterprise-agentic-saas/db"

import type { AccessControlFactory } from "../authorization/public"
import { createFilesInternalApplication } from "../files/public"
import {
  decideAgentActionForSession,
  executeAgentApprovedAction,
  getAgentActionForSession,
  getAgentApprovalPolicyForSession,
  getAgentIssueActionDecision,
  prepareAgentActionResumeForSession,
  prepareCreateIssueAction,
  prepareDeleteIssueAction,
  prepareUpdateIssueAction,
  putAgentApprovalPolicyForSession,
  resumeAgentApprovedAction,
} from "./actions/repository"
import { createAgentInternalRoutes } from "./internal-routes"
import { createAgentInternalService } from "./internal-service"
import { createAgentRoutes } from "./routes"
import {
  guardAgentWebSearchQuery,
  reserveAgentWebSearch,
} from "./runs/web-search"
import { getAgentRuntime } from "./runtime"
import { createAgentService } from "./service"
import { settleAgentMemoryCommit } from "./threads/memory-commit-repository"
import {
  archiveAgentThreadForSession,
  cancelAgentRun,
  cancelAgentRunForSession,
  consumeAgentConnectionTicket,
  createAgentThreadForSession,
  finishAgentRun,
  getAgentIssue,
  listAgentThreadsForSession,
  issueAgentConnectionTicket,
  prepareAgentChatForSession,
  prepareAgentClientToolContinuationForSession,
  readAgentAccountContext,
  readAgentActiveOrganization,
  revokeCurrentAgentContext,
  searchAgentIssueLabels,
  searchAgentIssues,
  searchAgentOrganizationMembers,
  startAgentRun,
} from "./threads/repository"
import {
  getAgentMonthlyUsageForSession,
  getAgentOrganizationUsageForSession,
  recordAgentUsage,
} from "./usage/repository"

export const createAgentModule = (
  db: Db,
  createAccessControl: AccessControlFactory
) => {
  const service = createAgentService({
    cancelAgentRunForSession: (input) => cancelAgentRunForSession(db, input),
    archiveAgentThreadForSession: (input) =>
      archiveAgentThreadForSession(db, input),
    createAgentThreadForSession: (input) =>
      createAgentThreadForSession(db, input),
    decideAgentActionForSession: (input) =>
      decideAgentActionForSession(db, input),
    fetchAgentRuntime: (request) => getAgentRuntime().fetch(request),
    getAgentActionForSession: (input) => getAgentActionForSession(db, input),
    getAgentApprovalPolicyForSession: (input) =>
      getAgentApprovalPolicyForSession(db, input),
    getAgentMonthlyUsageForSession: (input) =>
      getAgentMonthlyUsageForSession(db, input),
    getAgentOrganizationUsageForSession: (input) =>
      getAgentOrganizationUsageForSession(db, input),
    issueAgentConnectionTicket: (input) =>
      issueAgentConnectionTicket(db, input),
    listAgentThreadsForSession: (input) =>
      listAgentThreadsForSession(db, input),
    prepareAgentActionResumeForSession: (input) =>
      prepareAgentActionResumeForSession(db, input),
    prepareAgentChatForSession: (input) =>
      prepareAgentChatForSession(db, input),
    prepareAgentClientToolContinuationForSession: (input) =>
      prepareAgentClientToolContinuationForSession(db, input),
    putAgentApprovalPolicyForSession: (input) =>
      putAgentApprovalPolicyForSession(db, input),
    revokeCurrentAgentContext: (input) => revokeCurrentAgentContext(db, input),
  })

  return createAgentRoutes(service, createAccessControl)
}

/**
 * Repository境界のunit test用facade。Worker間transportの正本は
 * `createAgentInternalApp`をnamed WorkerEntrypointのfetchから呼ぶHTTP境界である。
 */
export const createAgentInternalApi = (db: Db) => {
  const files = createFilesInternalApplication(db)

  return createAgentInternalService({
    cancelRun: (input) => cancelAgentRun(db, input),
    consumeConnectionTicket: (input) => consumeAgentConnectionTicket(db, input),
    settleMemoryCommit: (input) => settleAgentMemoryCommit(db, input),
    executeApprovedAction: (input) => executeAgentApprovedAction(db, input),
    finishRun: (input) => finishAgentRun(db, input),
    getAgentImageForModel: (input) => files.getAgentImageForModel(input),
    getIssue: (input) => getAgentIssue(db, input),
    getIssueActionDecision: (input) => getAgentIssueActionDecision(db, input),
    getIssueAttachmentImageForModel: (input) =>
      files.getIssueAttachmentImageForModel(input),
    guardWebSearch: (input) => guardAgentWebSearchQuery(db, input),
    prepareCreateIssue: (input) => prepareCreateIssueAction(db, input),
    prepareDeleteIssue: (input) => prepareDeleteIssueAction(db, input),
    prepareUpdateIssue: (input) => prepareUpdateIssueAction(db, input),
    readAccountContext: (input) => readAgentAccountContext(db, input),
    readActiveOrganization: (input) => readAgentActiveOrganization(db, input),
    recordUsage: (input) => recordAgentUsage(db, input),
    reserveWebSearch: (input) => reserveAgentWebSearch(db, input),
    resumeApprovedAction: (input) => resumeAgentApprovedAction(db, input),
    searchIssueLabels: (input) => searchAgentIssueLabels(db, input),
    searchIssues: (input) => searchAgentIssues(db, input),
    searchOrganizationMembers: (input) =>
      searchAgentOrganizationMembers(db, input),
    startRun: (input) => startAgentRun(db, input),
  })
}

export const createAgentInternalApp = (db: Db) =>
  createAgentInternalRoutes(createAgentInternalApi(db))
