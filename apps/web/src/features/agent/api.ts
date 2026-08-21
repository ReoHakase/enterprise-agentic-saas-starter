import {
  unwrapEdenResult,
  type ApiClient,
} from "@enterprise-agentic-saas/api/client"

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

export const listAgentThreads = async (
  client: ApiClient,
  signal?: AbortSignal
) =>
  parseAgentThreads(
    unwrapEdenResult(await client.agent.threads.get({ fetch: { signal } }))
  )

export const createAgentThread = async (
  client: ApiClient,
  permissionMode: "ask_always" | "full_access"
) =>
  parseAgentThread(
    unwrapEdenResult(await client.agent.threads.post({ permissionMode }))
  )

export const archiveAgentThread = async (client: ApiClient, threadId: string) =>
  parseAgentThread(
    unwrapEdenResult(await client.agent.threads({ threadId }).archive.post())
  )

export const cancelAgentRun = async (
  client: ApiClient,
  input: { runId: string; threadId: string }
) =>
  parseAgentRunResult(
    unwrapEdenResult(
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
      unwrapEdenResult(
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
  throw new Error("Agent history exceeded the pagination limit")
}

export const getAgentAction = async (
  client: ApiClient,
  actionId: string,
  signal?: AbortSignal
) =>
  parseAgentIssueAction(
    unwrapEdenResult(
      await client.agent.actions({ actionId }).get({ fetch: { signal } })
    )
  )

export const decideAgentAction = async (
  client: ApiClient,
  input: { actionId: string; decision: "yes" | "no"; idempotencyKey: string }
) =>
  parseAgentIssueAction(
    unwrapEdenResult(
      await client.agent.actions({ actionId: input.actionId }).decision.post({
        decision: input.decision,
        idempotencyKey: input.idempotencyKey,
      })
    )
  )

export const resumeAgentAction = async (client: ApiClient, actionId: string) =>
  parseAgentActionExecutionResult(
    unwrapEdenResult(await client.agent.actions({ actionId }).resume.post({}))
  )

export const getAgentApprovalPolicy = async (
  client: ApiClient,
  threadId: string,
  signal?: AbortSignal
) =>
  parseAgentApprovalPolicy(
    unwrapEdenResult(
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
    unwrapEdenResult(
      await client.agent
        .threads({ threadId: input.threadId })
        .permission.put({ mode: input.mode })
    )
  )

export const revokeAgentContext = async (client: ApiClient) =>
  parseAgentContextRevocation(
    unwrapEdenResult(await client.agent.context.revoke.post())
  )

export const deleteAgentAsset = async (
  client: ApiClient,
  input: { organizationId: string; assetId: string }
) => {
  const organizationFiles = client.files.organizations({
    organizationId: input.organizationId,
  })
  unwrapEdenResult(
    await organizationFiles["agent-assets"]({
      assetId: input.assetId,
    }).delete()
  )
}
