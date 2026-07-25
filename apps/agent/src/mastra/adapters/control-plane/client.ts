import {
  createAgentInternalClient,
  type AgentAccountContext,
  type AgentActionExecutionResult,
  type AgentConnection,
  type AgentGuardedWebSearchQuery,
  type AgentInternalFetchBinding,
  type AgentIssue,
  type AgentIssueAction,
  type AgentIssueDetail,
  type AgentIssueLabel,
  type AgentMember,
  type AgentOrganizationContext,
  type AgentRunGrant,
  type AgentRunResult,
  type AgentThreadRenameResult,
  type AgentUsageRecordResult,
  type AgentWebSearchReservation,
} from "@enterprise-agentic-saas/api/agent-client"

import type { AgentControlPlanePort } from "../../runtime/ports"

export type AgentInternalGateway = AgentControlPlanePort

type EdenResult<T> = {
  data: T | null
  error: unknown
  headers?: HeadersInit
  response?: Response
  status: number
}

type InternalErrorBody = { error: unknown }

const isInternalErrorBody = (value: unknown): value is InternalErrorBody =>
  typeof value === "object" && value !== null && "error" in value

const isSuccessData = <T>(value: InternalErrorBody | T): value is T =>
  !isInternalErrorBody(value)

const boundedRetryAfter = (result: EdenResult<unknown>): number => {
  const edenHeader = result.headers
    ? new Headers(result.headers).get("retry-after")
    : null
  const raw = edenHeader ?? result.response?.headers.get("retry-after")
  if (raw && /^[1-9][0-9]{0,4}$/.test(raw)) {
    const seconds = Number(raw)
    if (seconds <= 86_400) return seconds
  }
  return 1
}

export class AgentInternalControlError extends Error {
  readonly status: 409 | 429
  readonly retryAfter: number | null

  constructor(status: 409 | 429, retryAfter: number | null = null) {
    super(
      status === 409
        ? "Agent run is already in progress"
        : "Agent run is temporarily limited"
    )
    this.name = "AgentInternalControlError"
    this.status = status
    this.retryAfter = status === 429 ? (retryAfter ?? 1) : null
  }
}

const isAgentInternalControlError = (
  value: unknown
): value is AgentInternalControlError =>
  value instanceof AgentInternalControlError

export const toAgentControlFailure = (value: unknown) => {
  if (!isAgentInternalControlError(value)) return null
  return value.status === 409
    ? {
        body: "Agent run already in progress",
        retryAfter: null,
        status: 409 as const,
      }
    : {
        body: "Agent capacity temporarily limited",
        retryAfter: value.retryAfter ?? 1,
        status: 429 as const,
      }
}

const unwrap = async <T>(
  request: Promise<EdenResult<InternalErrorBody | T>>
): Promise<T> => {
  const result = await request
  if (
    result.error !== null ||
    result.status < 200 ||
    result.status >= 300 ||
    result.data === null ||
    !isSuccessData<T>(result.data)
  ) {
    if (result.status === 409) throw new AgentInternalControlError(409)
    if (result.status === 429) {
      throw new AgentInternalControlError(429, boundedRetryAfter(result))
    }
    // API error body、grant、tenant identifierはAgent側のerrorへ転記しない。
    throw new Error("Agent internal capability is unavailable")
  }
  return result.data
}

const headers = (grant: string) => ({
  authorization: `Bearer ${grant}`,
})

const definedQuery = (
  query: Record<string, number | string | undefined>
): Record<string, number | string> => {
  const result: Record<string, number | string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

export const createAgentInternalGateway = (
  binding: AgentInternalFetchBinding
): AgentInternalGateway => {
  const client = createAgentInternalClient(binding)

  return {
    consumeConnectionTicket: (input) =>
      unwrap<AgentConnection>(
        client.internal.agent.connections.consume.post({
          threadId: input.threadId,
          ticket: input.ticket,
        })
      ),
    startRun: ({ grant, ...body }) =>
      unwrap<AgentRunGrant>(
        client.internal.agent.runs.post(
          {
            ...body,
            assetIds: body.assetIds ?? [],
            estimatedInputTokenCount: body.estimatedInputTokenCount ?? 0,
            trigger: body.trigger ?? "user_message",
          },
          { headers: headers(grant) }
        )
      ),
    reserveWebSearch: ({ grant, ...body }) =>
      unwrap<AgentWebSearchReservation>(
        client.internal.agent.runs["web-search"].reserve.post(body, {
          headers: headers(grant),
        })
      ),
    guardWebSearch: ({ grant, ...body }) =>
      unwrap<AgentGuardedWebSearchQuery>(
        client.internal.agent.runs["web-search"].guard.post(body, {
          headers: headers(grant),
        })
      ),
    cancelRun: ({ grant }) =>
      unwrap<AgentRunResult>(
        client.internal.agent.runs.cancel.post({}, { headers: headers(grant) })
      ),
    finishRun: ({ grant, ...body }) =>
      unwrap<AgentRunResult>(
        client.internal.agent.runs.finish.post(body, {
          headers: headers(grant),
        })
      ),
    appendRunMessages: ({ grant, ...body }) =>
      unwrap<{ appended: number }>(
        client.internal.agent.runs.messages.post(body, {
          headers: headers(grant),
        })
      ),
    renameThread: ({ grant, ...body }) =>
      unwrap<AgentThreadRenameResult>(
        client.internal.agent.runs["thread-title"].post(body, {
          headers: headers(grant),
        })
      ),
    recordUsage: ({ grant, ...body }) =>
      unwrap<AgentUsageRecordResult>(
        client.internal.agent.runs.usage.post(body, {
          headers: headers(grant),
        })
      ),
    readAccountContext: ({ grant }) =>
      unwrap<AgentAccountContext>(
        client.internal.agent.context.account.get({
          headers: headers(grant),
        })
      ),
    readActiveOrganization: ({ grant }) =>
      unwrap<AgentOrganizationContext>(
        client.internal.agent.context.organization.get({
          headers: headers(grant),
        })
      ),
    searchOrganizationMembers: ({ grant, ...query }) =>
      unwrap<AgentMember[]>(
        client.internal.agent.members.get({
          headers: headers(grant),
          query: definedQuery(query),
        })
      ),
    searchIssueLabels: ({ grant, ...query }) =>
      unwrap<AgentIssueLabel[]>(
        client.internal.agent["issue-labels"].get({
          headers: headers(grant),
          query: definedQuery(query),
        })
      ),
    searchIssues: ({ grant, ...query }) =>
      unwrap<AgentIssue[]>(
        client.internal.agent.issues.get({
          headers: headers(grant),
          query: definedQuery(query),
        })
      ),
    getIssue: (input) =>
      input.lookup === "number"
        ? unwrap<AgentIssueDetail>(
            client.internal.agent.issues["by-number"]({
              number: input.number,
            }).get({
              headers: headers(input.grant),
              query: definedQuery({
                attachmentCursor: input.attachmentCursor,
                attachmentLimit: input.attachmentLimit,
              }),
            })
          )
        : unwrap<AgentIssueDetail>(
            client.internal.agent.issues({ issueId: input.id }).get({
              headers: headers(input.grant),
              query: definedQuery({
                attachmentCursor: input.attachmentCursor,
                attachmentLimit: input.attachmentLimit,
              }),
            })
          ),
    prepareCreateIssue: ({ grant, ...body }) =>
      unwrap<AgentIssueAction>(
        client.internal.agent.actions.post(
          {
            ...body,
            kind: "create_issue",
            issue: {
              ...body.issue,
              attachmentAssetIds: body.issue.attachmentAssetIds ?? [],
            },
          },
          { headers: headers(grant) }
        )
      ),
    prepareUpdateIssue: ({ grant, ...body }) =>
      unwrap<AgentIssueAction>(
        client.internal.agent.actions.post(
          {
            ...body,
            kind: "update_issue",
          },
          { headers: headers(grant) }
        )
      ),
    prepareDeleteIssue: ({ grant, ...body }) =>
      unwrap<AgentIssueAction>(
        client.internal.agent.actions.post(
          {
            ...body,
            kind: "delete_issue",
          },
          { headers: headers(grant) }
        )
      ),
    getIssueActionDecision: ({ actionId, grant }) =>
      unwrap<AgentIssueAction>(
        client.internal.agent.actions({ actionId }).get({
          headers: headers(grant),
        })
      ),
    resumeApprovedAction: ({ actionId, resumeTicket }) =>
      unwrap<AgentRunGrant>(
        client.internal.agent
          .actions({ actionId })
          .resume.post({ resumeTicket })
      ),
    executeApprovedAction: ({ actionId, grant }) =>
      unwrap<AgentActionExecutionResult>(
        client.internal.agent.actions({ actionId }).execute.post(
          {},
          {
            headers: headers(grant),
          }
        )
      ),
    getAgentImageForModel: ({ assetId, grant }) =>
      binding.fetch(
        new Request(
          `https://agent-internal.invalid/internal/agent/assets/${encodeURIComponent(assetId)}/model`,
          { headers: headers(grant) }
        )
      ),
    getIssueAttachmentImageForModel: ({ fileId, grant, issueId }) =>
      binding.fetch(
        new Request(
          `https://agent-internal.invalid/internal/agent/issues/${encodeURIComponent(issueId)}/attachments/${encodeURIComponent(fileId)}/model`,
          { headers: headers(grant) }
        )
      ),
  }
}
