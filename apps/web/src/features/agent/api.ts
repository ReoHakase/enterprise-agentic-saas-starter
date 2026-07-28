import type { ApiClient } from "@enterprise-agentic-saas/api/client"

import { ConsoleApiError, toConsoleApiError } from "@/features/console"

import {
  type AgentChatMessage,
  parseAgentActionExecutionResult,
  parseAgentApprovalPolicy,
  parseAgentContextRevocation,
  parseAgentIssueAction,
  parseAgentMessagePage,
  parseAgentRunResult,
  parseAgentThread,
  parseAgentThreads,
} from "./schema"

type EdenResult = { data: unknown; error: unknown; status: number }
const unwrap = (result: EdenResult) => {
  if (result.error) throw toConsoleApiError(result.error, result.status)
  if (result.data === null || result.data === undefined) {
    throw new ConsoleApiError({
      code: "invalid_response",
      message: "API response did not include data",
      status: result.status,
    })
  }
  return result.data
}

export const listAgentThreads = async (
  client: ApiClient,
  signal?: AbortSignal
) =>
  parseAgentThreads(
    unwrap(await client.agent.threads.get({ fetch: { signal } }))
  )

export const createAgentThread = async (
  client: ApiClient,
  permissionMode: "ask_always" | "full_access"
) =>
  parseAgentThread(unwrap(await client.agent.threads.post({ permissionMode })))

export const archiveAgentThread = async (client: ApiClient, threadId: string) =>
  parseAgentThread(
    unwrap(await client.agent.threads({ threadId }).archive.post())
  )

export const cancelAgentRun = async (
  client: ApiClient,
  input: { runId: string; threadId: string }
) =>
  parseAgentRunResult(
    unwrap(
      await client.agent
        .threads({ threadId: input.threadId })
        .runs({ runId: input.runId })
        .cancel.post()
    )
  )

export const listAgentMessages = async (
  client: ApiClient,
  threadId: string,
  signal?: AbortSignal
) => {
  const messages: AgentChatMessage[] = []
  for (let page = 0; page < 10_000; page += 1) {
    // History pagination is ordered and bounded, so requests stay sequential.
    const result = parseAgentMessagePage(
      unwrap(
        // eslint-disable-next-line no-await-in-loop
        await client.agent.threads({ threadId }).messages.get({
          query: { page, perPage: 100 },
          fetch: { signal },
        })
      )
    )
    messages.unshift(...result.messages)
    if (!result.hasMore) return messages
  }
  throw new ConsoleApiError({
    code: "invalid_response",
    message: "Agent history exceeded the pagination limit",
    status: 503,
  })
}

export const getAgentAction = async (
  client: ApiClient,
  actionId: string,
  signal?: AbortSignal
) =>
  parseAgentIssueAction(
    unwrap(await client.agent.actions({ actionId }).get({ fetch: { signal } }))
  )

export const decideAgentAction = async (
  client: ApiClient,
  input: { actionId: string; decision: "yes" | "no"; idempotencyKey: string }
) =>
  parseAgentIssueAction(
    unwrap(
      await client.agent.actions({ actionId: input.actionId }).decision.post({
        decision: input.decision,
        idempotencyKey: input.idempotencyKey,
      })
    )
  )

export const resumeAgentAction = async (client: ApiClient, actionId: string) =>
  parseAgentActionExecutionResult(
    unwrap(await client.agent.actions({ actionId }).resume.post({}))
  )

export const getAgentApprovalPolicy = async (
  client: ApiClient,
  threadId: string,
  signal?: AbortSignal
) =>
  parseAgentApprovalPolicy(
    unwrap(
      await client.agent.threads({ threadId }).permission.get({
        fetch: { signal },
      })
    )
  )

export const putAgentApprovalPolicy = async (
  client: ApiClient,
  input: {
    threadId: string
    mode: "ask_always" | "full_access"
  }
) =>
  parseAgentApprovalPolicy(
    unwrap(
      await client.agent
        .threads({ threadId: input.threadId })
        .permission.put({ mode: input.mode })
    )
  )

export const revokeAgentContext = async (client: ApiClient) =>
  parseAgentContextRevocation(unwrap(await client.agent.context.revoke.post()))

export const deleteAgentAsset = async (
  client: ApiClient,
  input: { organizationId: string; assetId: string }
) => {
  const organizationFiles = client.files.organizations({
    organizationId: input.organizationId,
  })
  const result = await organizationFiles["agent-assets"]({
    assetId: input.assetId,
  }).delete()
  if (result.error) throw toConsoleApiError(result.error, result.status)
}
