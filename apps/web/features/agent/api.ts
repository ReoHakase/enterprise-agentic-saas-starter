import type { ApiClient } from "@enterprise-agentic-saas/api/client"

import {
  ConsoleApiError,
  toConsoleApiError,
} from "@/features/console/api.public"

import {
  parseAgentActionExecutionResult,
  parseAgentApprovalPolicy,
  parseAgentContextRevocation,
  parseAgentIssueAction,
  parseAgentMessages,
  parseAgentThread,
  parseAgentThreadContext,
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
  permissionMode: "ask_always" | "full_access",
  title?: string
) =>
  parseAgentThread(
    unwrap(await client.agent.threads.post({ title, permissionMode }))
  )

export const archiveAgentThread = async (client: ApiClient, threadId: string) =>
  parseAgentThread(
    unwrap(await client.agent.threads({ threadId }).archive.post())
  )

export const updateAgentThreadTitle = async (
  client: ApiClient,
  input: { threadId: string; title: string; expectedRevision: number }
) =>
  parseAgentThread(
    unwrap(
      await client.agent.threads({ threadId: input.threadId }).title.patch({
        title: input.title,
        expectedRevision: input.expectedRevision,
      })
    )
  )

export const listAgentMessages = async (
  client: ApiClient,
  threadId: string,
  signal?: AbortSignal
) =>
  parseAgentMessages(
    unwrap(
      await client.agent
        .threads({ threadId })
        .messages.get({ fetch: { signal } })
    )
  )

export const getAgentThreadContext = async (
  client: ApiClient,
  threadId: string,
  signal?: AbortSignal
) =>
  parseAgentThreadContext(
    unwrap(
      await client.agent
        .threads({ threadId })
        .context.get({ fetch: { signal } })
    )
  )

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
