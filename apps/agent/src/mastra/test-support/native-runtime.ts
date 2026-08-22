import {
  createProductAgent,
  createProductAgentMemory,
} from "../agents/product-agent"
import { createProductRuntime } from "../composition/create-runtime"
import { createScriptedAgentRuntimeComposition } from "../e2e/scripted-runtime-composition"
import type { AgentControlPlanePort } from "../runtime/ports"
import { ProductAgentExecutionRegistry } from "../runtime/request-context"
import {
  createScriptedModel,
  type ScriptedModelStep,
} from "../test-support/scripted-model"
import type { PublicWebSearchProvider } from "../tools/web-search/search-timeout"
import { createWebSearchTool } from "../tools/web-search/tool"

export const TEST_RUN_GRANT = "grant_0123456789abcdefghijklmnopqrstuvwxyz"
const future = new Date(Date.now() + 60_000).toISOString()
const unavailable = () => Promise.reject(new Error("unused"))

export const createNativeControlPlane = (
  lifecycle: Partial<AgentControlPlanePort> = {}
): AgentControlPlanePort => ({
  assertRunLive:
    lifecycle.assertRunLive ?? (() => Promise.resolve({ live: true })),
  authorizeWebSearch:
    lifecycle.authorizeWebSearch ??
    (({ query }) => Promise.resolve({ query, reserved: true, reused: false })),
  consumeConnectionTicket: () =>
    Promise.resolve({
      expiresAt: future,
      grant: TEST_RUN_GRANT,
      memoryResourceId: "resource_1",
      organization: {
        name: "Organization",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: false,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "member",
        slug: "organization",
      },
      thread: { id: "thread_1", title: "Thread" },
      user: { name: "User", profileImage: null },
    }),
  executeApprovedAction: () =>
    Promise.resolve({
      actionId: "action_1",
      issue: {
        deleted: false,
        id: "issue_1",
        number: 1,
        revision: 1,
      },
      kind: "create_issue",
      status: "succeeded",
    }),
  finalizeRun:
    lifecycle.finalizeRun ??
    (({ outcome }) =>
      Promise.resolve({
        runId: "run_1",
        status: outcome === "waiting_approval" ? outcome : outcome,
      })),
  getAgentImageForModel: lifecycle.getAgentImageForModel ?? unavailable,
  getIssue: unavailable,
  getIssueAttachmentImageForModel: unavailable,
  prepareCreateIssue: () =>
    Promise.resolve({
      approvalMode: "full_access",
      completedAt: null,
      expiresAt: future,
      id: "action_1",
      kind: "create_issue",
      preview: null,
      previewState: "available",
      requiresApproval: false,
      status: "approved",
    }),
  prepareDeleteIssue: unavailable,
  prepareUpdateIssue: unavailable,
  readAccountContext: unavailable,
  readActiveOrganization: () =>
    Promise.resolve({
      name: "Organization",
      permissions: {
        canCreateIssues: true,
        canDeleteAnyIssue: false,
        canDeleteOwnIssues: true,
        canReadIssues: true,
        canUpdateIssues: true,
      },
      role: "member",
      slug: "organization",
    }),
  resumeApprovedAction: unavailable,
  searchIssueLabels: unavailable,
  searchIssues: unavailable,
  searchOrganizationMembers: unavailable,
  startChatRun:
    lifecycle.startChatRun ??
    (() =>
      Promise.resolve({
        memoryResourceId: "resource_1",
        organization: {
          name: "Organization",
          permissions: {
            canCreateIssues: true,
            canDeleteAnyIssue: false,
            canDeleteOwnIssues: true,
            canReadIssues: true,
            canUpdateIssues: true,
          },
          role: "member",
          slug: "organization",
        },
        run: {
          attempt: 1,
          expiresAt: future,
          grant: TEST_RUN_GRANT,
          rootRunId: "run_1",
          runId: "run_1",
          shouldGenerateTitle: false,
        },
        thread: { id: "thread_1", title: "Thread" },
        user: { name: "User", profileImage: null },
      })),
})

export const createNativeChatRequest = (
  signal?: AbortSignal,
  assetIds: readonly string[] = [],
  clientMessageId = "message_1",
  text = "Create the scripted Issue"
) =>
  new Request("https://agent.internal/chat", {
    body: JSON.stringify({
      assetIds,
      clientMessageId,
      contextReferences: [],
      message: {
        id: clientMessageId,
        parts: [
          { text, type: "text" },
          ...(assetIds.length > 0
            ? [{ type: "data-agent-assets", data: { assetIds } }]
            : []),
        ],
        role: "user",
      },
      threadId: "thread_1",
      ticket: TEST_RUN_GRANT,
      timezone: "Asia/Tokyo",
      trigger: "user_message",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  })

export const nativeRuntimeEnvironment = {
  AGENT_INTERNAL_API: JSON.parse("{}"),
  AGENT_RUNS_ENABLED: "1",
  AGENT_VISION_ENABLED: "0",
  AGENT_WRITES_ENABLED: "1",
  MASTRA_STORAGE_URL: ":memory:",
  NODE_ENV: "test",
} as const

export const createNativeModelRuntime = (
  steps: readonly ScriptedModelStep[],
  executionRegistry: ProductAgentExecutionRegistry = new ProductAgentExecutionRegistry(),
  search: PublicWebSearchProvider = async () => ({
    finishReason: "stop",
    sources: [],
    text: "unused",
  })
) => {
  const composition = createScriptedAgentRuntimeComposition({
    MASTRA_STORAGE_URL: ":memory:",
    NODE_ENV: "test",
  })
  const memory = createProductAgentMemory(composition.storage)
  const productAgent = createProductAgent({
    memory,
    model: createScriptedModel(steps, {
      modelId: "scripted-native-runtime-agent",
    }),
    resolveExecution: executionRegistry.resolve,
    webSearchTool: createWebSearchTool(search, executionRegistry.resolve),
  })
  return {
    composition,
    executionRegistry,
    mastra: createProductRuntime({
      approvedIssueActionWorkflow: composition.approvedIssueActionWorkflow,
      productAgent,
      storage: composition.storage,
    }),
  }
}
