import type { ApiClient } from "@enterprise-agentic-saas/api/client"

import { ConsoleApiError, toConsoleApiError } from "@/features/console/api"

import {
  parseAgentApprovalPolicy,
  parseAgentConnectionTicket,
  parseAgentContextRevocation,
  parseAgentIssueAction,
  parseAgentResumeTicket,
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

export const createAgentThread = async (client: ApiClient, title?: string) =>
  parseAgentThread(unwrap(await client.agent.threads.post({ title })))

export const archiveAgentThread = async (client: ApiClient, threadId: string) =>
  parseAgentThread(
    unwrap(await client.agent.threads({ threadId }).archive.post())
  )

export const createAgentConnectionTicket = async (
  client: ApiClient,
  threadId: string
) =>
  parseAgentConnectionTicket(
    unwrap(await client.agent.connections.post({ threadId }))
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

// Deliberately kept out of TanStack Query: the opaque ticket is consumed from
// this local variable immediately and must never enter cache or persisted chat.
export const createAgentResumeTicket = async (
  client: ApiClient,
  actionId: string
) =>
  parseAgentResumeTicket(
    unwrap(await client.agent.actions({ actionId })["resume-ticket"].post())
  )

export const getAgentApprovalPolicy = async (
  client: ApiClient,
  threadId: string,
  signal?: AbortSignal
) =>
  parseAgentApprovalPolicy(
    unwrap(
      await client.agent["approval-policy"].get({
        query: { threadId },
        fetch: { signal },
      })
    )
  )

export const putAgentApprovalPolicy = async (
  client: ApiClient,
  input: {
    threadId: string
    mode: "ask_each" | "auto_write" | "auto_all"
    expiresInSeconds: number
    destructiveConfirmation?: "ALLOW_ISSUE_DELETE"
  }
) =>
  parseAgentApprovalPolicy(
    unwrap(await client.agent["approval-policy"].put(input))
  )

export const deleteAgentApprovalPolicy = async (
  client: ApiClient,
  threadId: string
) =>
  parseAgentApprovalPolicy(
    unwrap(
      await client.agent["approval-policy"].delete(
        {},
        {
          query: { threadId },
        }
      )
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
