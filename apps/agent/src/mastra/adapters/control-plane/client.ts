import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/agent-contracts"
import {
  agentAccountContextSchema,
  agentActionExecutionResultSchema,
  agentConnectionSchema,
  agentGuardedWebSearchQuerySchema,
  agentIssueActionSchema,
  agentIssueDetailSchema,
  agentIssueLabelListSchema,
  agentIssueListSchema,
  agentMemberListSchema,
  agentOrganizationContextSchema,
  agentRunGrantSchema,
  agentRunResultSchema,
  agentUsageRecordResultSchema,
  agentWebSearchReservationSchema,
} from "@enterprise-agentic-saas/agent-contracts"
import * as v from "valibot"

import type { AgentControlPlanePort } from "../../runtime/ports"

export type AgentInternalGateway = AgentControlPlanePort

type InternalRequest = {
  body?: unknown
  grant?: string
  method: "GET" | "POST"
  path: string
  query?: Record<string, number | string | undefined>
}

// searchIssuesの最大50件について、description 50,000 code unitsがすべて
// JSON escape 6 bytesになり、labels/titleも同様になるworst-caseを含める。
const MAX_INTERNAL_JSON_BYTES = 16 * 1_024 * 1_024
const INTERNAL_RESPONSE_ERROR = "Agent internal capability is unavailable"

const parseContentLength = (response: Response): number | null => {
  const raw = response.headers.get("content-length")
  if (raw === null) return null
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new Error(INTERNAL_RESPONSE_ERROR)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value > MAX_INTERNAL_JSON_BYTES) {
    throw new Error(INTERNAL_RESPONSE_ERROR)
  }
  return value
}

const readBoundedJson = async (response: Response): Promise<unknown> => {
  parseContentLength(response)
  if (!response.body) throw new Error(INTERNAL_RESPONSE_ERROR)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  const readNextChunk = async (): Promise<void> => {
    const chunk = await reader.read()
    if (chunk.done) return
    totalBytes += chunk.value.byteLength
    if (totalBytes > MAX_INTERNAL_JSON_BYTES) {
      void reader.cancel()
      throw new Error(INTERNAL_RESPONSE_ERROR)
    }
    chunks.push(chunk.value)
    await readNextChunk()
  }
  try {
    await readNextChunk()
  } catch {
    throw new Error(INTERNAL_RESPONSE_ERROR)
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    throw new Error(INTERNAL_RESPONSE_ERROR)
  }
}

const boundedRetryAfter = (response: Response): number => {
  const raw = response.headers.get("retry-after")
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

const internalRequest = async <TSchema extends v.GenericSchema>(
  binding: AgentInternalFetchBinding,
  input: InternalRequest,
  schema: TSchema
): Promise<v.InferOutput<TSchema>> => {
  const url = new URL(input.path, "https://agent-internal.invalid")
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const headers = new Headers()
  if (input.grant) headers.set("authorization", `Bearer ${input.grant}`)
  if (input.body !== undefined) headers.set("content-type", "application/json")
  const response = await binding.fetch(
    new Request(url, {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers,
      method: input.method,
    })
  )
  if (response.status === 409) throw new AgentInternalControlError(409)
  if (response.status === 429) {
    throw new AgentInternalControlError(429, boundedRetryAfter(response))
  }
  if (!response.ok) {
    throw new Error(INTERNAL_RESPONSE_ERROR)
  }
  const result = v.safeParse(schema, await readBoundedJson(response))
  if (!result.success) throw new Error(INTERNAL_RESPONSE_ERROR)
  return result.output
}

const encodePath = (value: string) => encodeURIComponent(value)

const createIssueActionGateway = (binding: AgentInternalFetchBinding) => ({
  prepareCreateIssue: ({
    grant,
    ...body
  }: Parameters<AgentInternalGateway["prepareCreateIssue"]>[0]) =>
    internalRequest(
      binding,
      {
        body: {
          ...body,
          kind: "create_issue",
          issue: {
            ...body.issue,
            attachmentAssetIds: body.issue.attachmentAssetIds ?? [],
          },
        },
        grant,
        method: "POST",
        path: "/internal/agent/actions",
      },
      agentIssueActionSchema
    ),
  prepareUpdateIssue: ({
    grant,
    ...body
  }: Parameters<AgentInternalGateway["prepareUpdateIssue"]>[0]) =>
    internalRequest(
      binding,
      {
        body: { ...body, kind: "update_issue" },
        grant,
        method: "POST",
        path: "/internal/agent/actions",
      },
      agentIssueActionSchema
    ),
  prepareDeleteIssue: ({
    grant,
    ...body
  }: Parameters<AgentInternalGateway["prepareDeleteIssue"]>[0]) =>
    internalRequest(
      binding,
      {
        body: { ...body, kind: "delete_issue" },
        grant,
        method: "POST",
        path: "/internal/agent/actions",
      },
      agentIssueActionSchema
    ),
  getIssueActionDecision: ({
    actionId,
    grant,
  }: Parameters<AgentInternalGateway["getIssueActionDecision"]>[0]) =>
    internalRequest(
      binding,
      {
        grant,
        method: "GET",
        path: `/internal/agent/actions/${encodePath(actionId)}`,
      },
      agentIssueActionSchema
    ),
  resumeApprovedAction: ({
    actionId,
    resumeTicket,
  }: Parameters<AgentInternalGateway["resumeApprovedAction"]>[0]) =>
    internalRequest(
      binding,
      {
        body: { resumeTicket },
        method: "POST",
        path: `/internal/agent/actions/${encodePath(actionId)}/resume`,
      },
      agentRunGrantSchema
    ),
  executeApprovedAction: ({
    actionId,
    grant,
  }: Parameters<AgentInternalGateway["executeApprovedAction"]>[0]) =>
    internalRequest(
      binding,
      {
        body: {},
        grant,
        method: "POST",
        path: `/internal/agent/actions/${encodePath(actionId)}/execute`,
      },
      agentActionExecutionResultSchema
    ),
})

export const createAgentInternalGateway = (
  binding: AgentInternalFetchBinding
): AgentInternalGateway => ({
  ...createIssueActionGateway(binding),
  consumeConnectionTicket: (body) =>
    internalRequest(
      binding,
      {
        body,
        method: "POST",
        path: "/internal/agent/connections/consume",
      },
      agentConnectionSchema
    ),
  startRun: ({ grant, ...body }) =>
    internalRequest(
      binding,
      {
        body: {
          ...body,
          assetIds: body.assetIds ?? [],
          estimatedInputTokenCount: body.estimatedInputTokenCount ?? 0,
          trigger: body.trigger ?? "user_message",
        },
        grant,
        method: "POST",
        path: "/internal/agent/runs",
      },
      agentRunGrantSchema
    ),
  reserveWebSearch: ({ grant, ...body }) =>
    internalRequest(
      binding,
      {
        body,
        grant,
        method: "POST",
        path: "/internal/agent/runs/web-search/reserve",
      },
      agentWebSearchReservationSchema
    ),
  guardWebSearch: ({ grant, ...body }) =>
    internalRequest(
      binding,
      {
        body,
        grant,
        method: "POST",
        path: "/internal/agent/runs/web-search/guard",
      },
      agentGuardedWebSearchQuerySchema
    ),
  cancelRun: ({ grant }) =>
    internalRequest(
      binding,
      {
        body: {},
        grant,
        method: "POST",
        path: "/internal/agent/runs/cancel",
      },
      agentRunResultSchema
    ),
  finishRun: ({ grant, ...body }) =>
    internalRequest(
      binding,
      {
        body,
        grant,
        method: "POST",
        path: "/internal/agent/runs/finish",
      },
      agentRunResultSchema
    ),
  recordUsage: ({ grant, ...body }) =>
    internalRequest(
      binding,
      {
        body,
        grant,
        method: "POST",
        path: "/internal/agent/runs/usage",
      },
      agentUsageRecordResultSchema
    ),
  readAccountContext: ({ grant }) =>
    internalRequest(
      binding,
      {
        grant,
        method: "GET",
        path: "/internal/agent/context/account",
      },
      agentAccountContextSchema
    ),
  readActiveOrganization: ({ grant }) =>
    internalRequest(
      binding,
      {
        grant,
        method: "GET",
        path: "/internal/agent/context/organization",
      },
      agentOrganizationContextSchema
    ),
  searchOrganizationMembers: ({ grant, ...query }) =>
    internalRequest(
      binding,
      {
        grant,
        method: "GET",
        path: "/internal/agent/members",
        query,
      },
      agentMemberListSchema
    ),
  searchIssueLabels: ({ grant, ...query }) =>
    internalRequest(
      binding,
      {
        grant,
        method: "GET",
        path: "/internal/agent/issue-labels",
        query,
      },
      agentIssueLabelListSchema
    ),
  searchIssues: ({ grant, ...query }) =>
    internalRequest(
      binding,
      {
        grant,
        method: "GET",
        path: "/internal/agent/issues",
        query,
      },
      agentIssueListSchema
    ),
  getIssue: (input) =>
    internalRequest(
      binding,
      {
        grant: input.grant,
        method: "GET",
        path:
          input.lookup === "number"
            ? `/internal/agent/issues/by-number/${input.number}`
            : `/internal/agent/issues/${encodePath(input.id)}`,
        query: {
          attachmentCursor: input.attachmentCursor,
          attachmentLimit: input.attachmentLimit,
        },
      },
      agentIssueDetailSchema
    ),
  getAgentImageForModel: ({ assetId, grant }) =>
    binding.fetch(
      new Request(
        `https://agent-internal.invalid/internal/agent/assets/${encodePath(assetId)}/model`,
        { headers: { authorization: `Bearer ${grant}` } }
      )
    ),
  getIssueAttachmentImageForModel: ({ fileId, grant, issueId }) =>
    binding.fetch(
      new Request(
        `https://agent-internal.invalid/internal/agent/issues/${encodePath(issueId)}/attachments/${encodePath(fileId)}/model`,
        { headers: { authorization: `Bearer ${grant}` } }
      )
    ),
})
