import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
  createFixture,
  createRun,
  request,
} from "./action-repository.test-support"
import { findApplicablePolicy } from "./actions/prepare-read-support"
import {
  deleteAgentApprovalPolicyForSession,
  getAgentApprovalPolicyForSession,
  putAgentApprovalPolicyForSession,
} from "./actions/repository"
import { issueAgentConnectionTicket } from "./threads/repository"

describe("Agent Issue approval policies and full access", () => {
  it("taints the run after Web search and forces subsequent writes to manual approval", async () => {
    const { app, db } = await createFixture()
    const actionRun = await createRun(db, {
      clientMessageId: "web-search-approval-fence",
      webSearchQuery: "Cloudflare R2 current limits",
    })
    const policy = await app.handle(
      request(`/agent/threads/${actionRun.thread.id}/permission`, {
        method: "PUT",
        body: { mode: "full_access" },
      })
    )
    expect(policy.status).toBe(200)

    const beforeSearch = await actionRun.internal.prepareUpdateIssue({
      grant: actionRun.run.grant,
      toolCallId: "tool-before-web-search",
      idempotencyKey: "prepare-before-web-search",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        priority: "high",
      },
    })
    expect(beforeSearch).toMatchObject({
      approvalMode: "full_access",
      requiresApproval: false,
      status: "approved",
    })
    await expect(
      actionRun.internal.executeApprovedAction({
        actionId: beforeSearch.id,
        grant: actionRun.run.grant,
      })
    ).resolves.toMatchObject({ issue: { revision: 2 } })

    await expect(
      actionRun.internal.authorizeWebSearch({
        grant: actionRun.run.grant,
        operationId: "tool-public-web-search",
        query: "Cloudflare R2 current limits",
      })
    ).resolves.toEqual({
      query: "Cloudflare R2 current limits",
      reserved: true,
      reused: false,
    })
    const [firstTaint] = await db
      .select({ webSearchUsedAt: schema.agentRuns.webSearchUsedAt })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, actionRun.run.runId))
    await expect(
      actionRun.internal.authorizeWebSearch({
        grant: actionRun.run.grant,
        operationId: "tool-public-web-search-retry",
        query: "Cloudflare R2 current limits",
      })
    ).resolves.toEqual({
      query: "Cloudflare R2 current limits",
      reserved: true,
      reused: false,
    })
    const [retriedTaint] = await db
      .select({ webSearchUsedAt: schema.agentRuns.webSearchUsedAt })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, actionRun.run.runId))
    expect(retriedTaint?.webSearchUsedAt).toEqual(firstTaint?.webSearchUsedAt)

    const afterSearch = await actionRun.internal.prepareUpdateIssue({
      grant: actionRun.run.grant,
      toolCallId: "tool-after-web-search",
      idempotencyKey: "prepare-after-web-search",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 2,
        status: "closed",
      },
    })
    expect(afterSearch).toMatchObject({
      approvalMode: null,
      requiresApproval: true,
      status: "pending",
    })
    const [issue] = await db
      .select({
        revision: schema.issues.revision,
        status: schema.issues.status,
      })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue).toEqual({ revision: 2, status: "open" })
    await expect(
      getAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: actionRun.thread.id,
      })
    ).resolves.toMatchObject({ mode: "full_access" })

    await actionRun.internal.finalizeRun({
      grant: actionRun.run.grant,
      outcome: "canceled",
    })
    const cleanTicket = await issueAgentConnectionTicket(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: actionRun.thread.id,
    })
    const cleanChatRun = await actionRun.internal.startChatRun({
      clientMessageId: "clean-run-after-web-search",
      assetIds: [],
      ticket: cleanTicket.ticket,
      threadId: actionRun.thread.id,
    })
    await expect(
      actionRun.internal.prepareUpdateIssue({
        grant: cleanChatRun.run.grant,
        toolCallId: "tool-clean-run-write",
        idempotencyKey: "prepare-clean-run-write",
        issue: {
          issueId: "action-issue-a",
          expectedRevision: 2,
          status: "closed",
        },
      })
    ).resolves.toMatchObject({
      approvalMode: "full_access",
      requiresApproval: false,
      status: "approved",
    })
  })

  it("fails closed when the run row used by the policy lookup is missing", async () => {
    const { db } = await createFixture()
    await expect(
      db.transaction((tx) =>
        findApplicablePolicy(
          tx,
          {
            organizationId: "action-org-a",
            threadId: "missing-thread",
            runId: "missing-run",
            sessionId: "action-session-a",
            userId: "action-user-a",
            contextEpoch: 1,
            webSearchQueryHash: null,
            role: "owner",
            runStatus: "running",
            runScope: "chat",
            rootRunId: "missing-run",
            resumedActionId: null,
          },
          new Date()
        )
      )
    ).resolves.toBeNull()
  })

  it("forces a delete selected after Web search to manual approval", async () => {
    const { db } = await createFixture()
    const actionRun = await createRun(db, {
      clientMessageId: "web-search-delete-fence",
      webSearchQuery: "Cloudflare R2 current limits",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: actionRun.thread.id,
      mode: "full_access",
    })
    await actionRun.internal.authorizeWebSearch({
      grant: actionRun.run.grant,
      operationId: "tool-public-web-search-delete",
      query: "Cloudflare R2 current limits",
    })

    await expect(
      actionRun.internal.prepareDeleteIssue({
        grant: actionRun.run.grant,
        toolCallId: "tool-delete-after-web-search",
        idempotencyKey: "prepare-delete-after-web-search",
        issue: { issueId: "action-issue-a", expectedRevision: 1 },
      })
    ).resolves.toMatchObject({
      approvalMode: null,
      requiresApproval: true,
      status: "pending",
    })
    const [issue] = await db
      .select({ id: schema.issues.id, revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue).toEqual({ id: "action-issue-a", revision: 1 })
  })

  it("forces a create selected after Web search to manual approval", async () => {
    const { db } = await createFixture()
    const actionRun = await createRun(db, {
      clientMessageId: "web-search-create-fence",
      webSearchQuery: "Cloudflare R2 current limits",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: actionRun.thread.id,
      mode: "full_access",
    })
    await actionRun.internal.authorizeWebSearch({
      grant: actionRun.run.grant,
      operationId: "tool-public-web-search-create",
      query: "Cloudflare R2 current limits",
    })

    await expect(
      actionRun.internal.prepareCreateIssue({
        grant: actionRun.run.grant,
        toolCallId: "tool-create-after-web-search",
        idempotencyKey: "prepare-create-after-web-search",
        issue: { title: "FORBIDDEN_SEARCH_INJECTED_WRITE" },
      })
    ).resolves.toMatchObject({
      approvalMode: null,
      requiresApproval: true,
      status: "pending",
    })
    expect(
      await db
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(eq(schema.issues.title, "FORBIDDEN_SEARCH_INJECTED_WRITE"))
    ).toEqual([])
  })

  it("returns the current permission to ask always through the public route", async () => {
    const { app, db } = await createFixture()
    const { thread } = await createRun(db, {
      clientMessageId: "delete-policy-route",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })

    const response = await app.handle(
      request(`/agent/threads/${thread.id}/permission`, {
        method: "PUT",
        body: { mode: "ask_always" },
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toEqual({
      mode: "ask_always",
      permissions: {
        createIssue: false,
        updateIssue: false,
        deleteIssue: false,
      },
    })
    const [policy] = await db
      .select({ mode: schema.agentThreadPermissions.mode })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, thread.id))
    expect(policy).toEqual({ mode: "ask_always" })

    const invalid = await app.handle(
      request("/agent/threads/%20/permission", {
        method: "PUT",
        body: { mode: "ask_always" },
      })
    )
    expect(invalid.status).toBe(400)
  })

  it("revokes the scoped approval policy idempotently", async () => {
    const { db } = await createFixture()
    const { thread } = await createRun(db, {
      clientMessageId: "delete-policy-idempotent",
    })
    const policyNow = new Date()
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
      now: policyNow,
    })
    const firstRevokedAt = new Date(policyNow.getTime() + 1_000)
    const defaultPolicy = {
      mode: "ask_always" as const,
      permissions: {
        createIssue: false,
        updateIssue: false,
        deleteIssue: false,
      },
    }

    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: thread.id,
        now: firstRevokedAt,
      })
    ).resolves.toEqual(defaultPolicy)
    const afterFirst = await db
      .select({ id: schema.agentThreadPermissions.id })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, thread.id))
    expect(afterFirst).toEqual([])

    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: thread.id,
        now: new Date(firstRevokedAt.getTime() + 1_000),
      })
    ).resolves.toEqual(defaultPolicy)
    const afterRetry = await db
      .select({ id: schema.agentThreadPermissions.id })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, thread.id))
    expect(afterRetry).toEqual([])
  })

  it("does not revoke approval policies owned by another tenant or user", async () => {
    const { db } = await createFixture()
    const now = new Date()
    await db.insert(schema.session).values({
      id: "action-session-other-policy",
      userId: "action-user-a",
      token: "action-token-other-policy",
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-b",
    })
    const otherTenant = await createRun(db, {
      clientMessageId: "delete-policy-other-tenant",
      sessionId: "action-session-other-policy",
    })
    const otherOwner = await createRun(db, {
      clientMessageId: "delete-policy-other-owner",
      userId: "action-user-b",
      sessionId: "action-session-b",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-other-policy",
      userId: "action-user-a",
      threadId: otherTenant.thread.id,
      mode: "full_access",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-b",
      userId: "action-user-b",
      threadId: otherOwner.thread.id,
      mode: "full_access",
    })

    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: otherTenant.thread.id,
      })
    ).rejects.toMatchObject({ code: "not_found" })
    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: otherOwner.thread.id,
      })
    ).rejects.toMatchObject({ code: "not_found" })

    const [otherTenantPolicy] = await db
      .select({ mode: schema.agentThreadPermissions.mode })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, otherTenant.thread.id))
    const [otherOwnerPolicy] = await db
      .select({ mode: schema.agentThreadPermissions.mode })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, otherOwner.thread.id))
    expect(otherTenantPolicy?.mode).toBe("full_access")
    expect(otherOwnerPolicy?.mode).toBe("full_access")
  })

  it("executes full_access delete through the same revision and audit boundary", async () => {
    const { app, db } = await createFixture()
    const actionRun = await createRun(db, { clientMessageId: "auto-delete" })
    const policy = await app.handle(
      request(`/agent/threads/${actionRun.thread.id}/permission`, {
        method: "PUT",
        body: { mode: "full_access" },
      })
    )
    expect(policy.status).toBe(200)
    const prepared = await actionRun.internal.prepareDeleteIssue({
      grant: actionRun.run.grant,
      toolCallId: "tool-auto-delete",
      idempotencyKey: "prepare-auto-delete",
      issue: { issueId: "action-issue-a", expectedRevision: 1 },
    })
    expect(prepared).toMatchObject({
      approvalMode: "full_access",
      status: "approved",
      preview: { destructive: true, issueNumber: 1 },
    })
    const result = await actionRun.internal.executeApprovedAction({
      grant: actionRun.run.grant,
      actionId: prepared.id,
    })
    expect(result).toMatchObject({
      issue: { deleted: true, id: "action-issue-a", revision: 1 },
      status: "succeeded",
    })
    expect(
      await db
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(eq(schema.issues.id, "action-issue-a"))
    ).toEqual([])
    const audits = await db
      .select({ metadata: schema.auditLogs.metadata })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.targetId, "action-issue-a"))
    expect(audits).toEqual([
      {
        metadata: {
          actionId: prepared.id,
          approvalMode: "auto_policy",
          number: 1,
          source: "agent",
        },
      },
    ])
  })
})
