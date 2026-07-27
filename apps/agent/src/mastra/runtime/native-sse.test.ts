import { describe, expect, it, vi } from "vitest"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import {
  scriptedApprovedIssueActionExecutionRegistry,
  scriptedSseExecutionRegistry,
  scriptedSseMastra,
  scriptedThreadTitleAgent,
} from "../e2e/scripted-scenarios"
import type { AgentControlPlanePort } from "./ports"
import { handleAgentRuntimeRequest } from "./run-agent"

const GRANT = "grant_0123456789abcdefghijklmnopqrstuvwxyz"
const future = new Date(Date.now() + 60_000).toISOString()
const unavailable = () => Promise.reject(new Error("unused"))

const createControlPlane = (): AgentControlPlanePort => ({
  cancelRun: unavailable,
  consumeConnectionTicket: () =>
    Promise.resolve({
      expiresAt: future,
      grant: GRANT,
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
  finishRun: (_input) =>
    Promise.resolve({ runId: "run_1", status: "completed" }),
  getAgentImageForModel: unavailable,
  getIssue: unavailable,
  getIssueActionDecision: unavailable,
  getIssueAttachmentImageForModel: unavailable,
  guardWebSearch: unavailable,
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
  readActiveOrganization: unavailable,
  recordUsage: () =>
    Promise.resolve({
      calculatedCostMicros: 0,
      pricingVersion: "unpriced",
      recorded: true,
    }),
  reserveWebSearch: unavailable,
  resumeApprovedAction: unavailable,
  searchIssueLabels: unavailable,
  searchIssues: unavailable,
  searchOrganizationMembers: unavailable,
  startRun: () =>
    Promise.resolve({
      attempt: 1,
      expiresAt: future,
      grant: GRANT,
      rootRunId: "run_1",
      runId: "run_1",
      shouldGenerateTitle: false,
    }),
})

describe("native runtime SSE privacy", () => {
  it("redacts provider metadata on the actual SSE response path", async () => {
    const pending: Promise<unknown>[] = []
    const response = await handleAgentRuntimeRequest(
      new Request("https://agent.internal/chat", {
        body: JSON.stringify({
          assetIds: [],
          clientMessageId: "message_1",
          contextReferences: [],
          message: {
            id: "message_1",
            parts: [{ text: "Create the scripted Issue", type: "text" }],
            role: "user",
          },
          threadId: "thread_1",
          ticket: GRANT,
          timezone: "Asia/Tokyo",
          trigger: "user_message",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {
        AGENT_INTERNAL_API: JSON.parse("{}"),
        AGENT_RUNS_ENABLED: "1",
        AGENT_VISION_ENABLED: "0",
        AGENT_WRITES_ENABLED: "1",
        MASTRA_STORAGE_URL: ":memory:",
        NODE_ENV: "test",
        SENTRY_ENVIRONMENT: "test",
      },
      { waitUntil: (promise) => pending.push(promise) },
      {
        approvedIssueActionExecutionRegistry:
          scriptedApprovedIssueActionExecutionRegistry,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        createControlPlane,
        executionRegistry: scriptedSseExecutionRegistry,
        mastra: scriptedSseMastra,
        requireModelCredential: false,
        threadTitleAgent: scriptedThreadTitleAgent,
        toControlFailure: () => null,
      }
    )
    const body = await response.text()
    await Promise.all(pending)

    expect(body).toContain("SCRIPTED_NATIVE_SSE_OK")
    expect(response.status).toBe(200)
    expect(body).not.toContain("PRIVATE_PROVIDER_METADATA_SENTINEL")
    expect(body).not.toContain("providerMetadata")
    expect(body).not.toContain("callProviderMetadata")
    expect(body).not.toContain("resultProviderMetadata")
    expect(body).not.toContain("toolMetadata")
  })
})
