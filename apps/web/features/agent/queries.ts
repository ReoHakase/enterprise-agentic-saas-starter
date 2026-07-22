import type { ApiClient } from "@enterprise-agentic-saas/api/client"
import { queryOptions, type QueryFunctionContext } from "@tanstack/react-query"

import {
  getAgentAction,
  getAgentApprovalPolicy,
  getAgentMonthlyUsage,
  getAgentThreadContext,
  listAgentMessages,
  listAgentThreads,
} from "./api"

export const agentKeys = {
  all: ["agent"] as const,
  threads: (organizationId: string) =>
    [...agentKeys.all, "threads", organizationId] as const,
  messages: (organizationId: string, threadId: string) =>
    [...agentKeys.all, "messages", organizationId, threadId] as const,
  action: (organizationId: string, actionId: string) =>
    [...agentKeys.all, "action", organizationId, actionId] as const,
  policy: (organizationId: string, threadId: string) =>
    [...agentKeys.all, "policy", organizationId, threadId] as const,
  context: (organizationId: string, threadId: string) =>
    [...agentKeys.all, "context", organizationId, threadId] as const,
  usage: (organizationId: string) =>
    [...agentKeys.all, "usage", organizationId] as const,
}

const createAgentThreadsQueryFn =
  (client: ApiClient) =>
  ({ signal }: QueryFunctionContext) =>
    listAgentThreads(client, signal)
const createAgentActionQueryFn =
  (client: ApiClient, actionId: string) =>
  ({ signal }: QueryFunctionContext) =>
    getAgentAction(client, actionId, signal)
const createAgentMessagesQueryFn =
  (client: ApiClient, threadId: string) =>
  ({ signal }: QueryFunctionContext) =>
    listAgentMessages(client, threadId, signal)
const createAgentPolicyQueryFn =
  (client: ApiClient, threadId: string) =>
  ({ signal }: QueryFunctionContext) =>
    getAgentApprovalPolicy(client, threadId, signal)
const createAgentThreadContextQueryFn =
  (client: ApiClient, threadId: string) =>
  ({ signal }: QueryFunctionContext) =>
    getAgentThreadContext(client, threadId, signal)
const createAgentUsageQueryFn =
  (client: ApiClient) =>
  ({ signal }: QueryFunctionContext) =>
    getAgentMonthlyUsage(client, signal)

export const agentThreadsQueryOptions = (
  client: ApiClient,
  organizationId: string
) =>
  queryOptions({
    queryKey: agentKeys.threads(organizationId),
    queryFn: createAgentThreadsQueryFn(client),
    enabled: organizationId.length > 0,
  })

export const agentActionQueryOptions = (
  client: ApiClient,
  organizationId: string,
  actionId: string
) =>
  queryOptions({
    queryKey: agentKeys.action(organizationId, actionId),
    queryFn: createAgentActionQueryFn(client, actionId),
    enabled: organizationId.length > 0 && actionId.length > 0,
    staleTime: 0,
  })

export const agentMessagesQueryOptions = (
  client: ApiClient,
  organizationId: string,
  threadId: string
) =>
  queryOptions({
    queryKey: agentKeys.messages(organizationId, threadId),
    queryFn: createAgentMessagesQueryFn(client, threadId),
    enabled: organizationId.length > 0 && threadId.length > 0,
    staleTime: 0,
  })

export const agentApprovalPolicyQueryOptions = (
  client: ApiClient,
  organizationId: string,
  threadId: string
) =>
  queryOptions({
    queryKey: agentKeys.policy(organizationId, threadId),
    queryFn: createAgentPolicyQueryFn(client, threadId),
    enabled: organizationId.length > 0 && threadId.length > 0,
    staleTime: 0,
  })

export const agentThreadContextQueryOptions = (
  client: ApiClient,
  organizationId: string,
  threadId: string
) =>
  queryOptions({
    queryKey: agentKeys.context(organizationId, threadId),
    queryFn: createAgentThreadContextQueryFn(client, threadId),
    enabled: organizationId.length > 0 && threadId.length > 0,
  })

export const agentUsageQueryOptions = (
  client: ApiClient,
  organizationId: string
) =>
  queryOptions({
    queryKey: agentKeys.usage(organizationId),
    queryFn: createAgentUsageQueryFn(client),
    enabled: organizationId.length > 0,
  })
