import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentThreadPermissions,
  type AgentThreadPermissionMode,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import type { AgentApprovalPolicy } from "../../../agent-client"
import { ensureAgentSessionContextInTransaction } from "../context/repository"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
  type AgentTransaction,
} from "../threads/repository"

const policyPermissions = (
  mode: AgentThreadPermissionMode
): AgentApprovalPolicy["permissions"] => ({
  createIssue: mode === "full_access",
  updateIssue: mode === "full_access",
  deleteIssue: mode === "full_access",
})

const defaultPolicy = (): AgentApprovalPolicy => ({
  mode: "ask_always",
  permissions: policyPermissions("ask_always"),
})

const requirePolicyScope = async (
  tx: AgentTransaction,
  input: { sessionId: string; userId: string; threadId: string; now: Date }
) => {
  const live = await requireLiveSession(tx, input)
  await requireActiveMembership(tx, live)
  await requireOwnedThread(tx, {
    threadId: input.threadId,
    userId: input.userId,
    activeOrganizationId: live.activeOrganizationId,
  })
  const context = await ensureAgentSessionContextInTransaction(tx, input)
  return { live, context }
}

export const getAgentApprovalPolicyForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string; now?: Date }
): Promise<AgentApprovalPolicy> =>
  await db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const { context, live } = await requirePolicyScope(tx, { ...input, now })
    const rows = await tx
      .select()
      .from(agentThreadPermissions)
      .where(
        and(
          eq(agentThreadPermissions.organizationId, live.activeOrganizationId),
          eq(agentThreadPermissions.threadId, input.threadId),
          eq(agentThreadPermissions.sessionId, input.sessionId),
          eq(agentThreadPermissions.userId, input.userId),
          eq(agentThreadPermissions.contextEpoch, context.contextEpoch)
        )
      )
      .limit(1)
    const policy = rows[0]
    if (!policy) return defaultPolicy()
    return {
      mode: policy.mode,
      permissions: policyPermissions(policy.mode),
    }
  })

/** @internal */
export const deleteAgentApprovalPolicyForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string; now?: Date }
): Promise<AgentApprovalPolicy> =>
  await db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const { context, live } = await requirePolicyScope(tx, { ...input, now })
    await tx
      .delete(agentThreadPermissions)
      .where(
        and(
          eq(agentThreadPermissions.organizationId, live.activeOrganizationId),
          eq(agentThreadPermissions.threadId, input.threadId),
          eq(agentThreadPermissions.sessionId, input.sessionId),
          eq(agentThreadPermissions.userId, input.userId),
          eq(agentThreadPermissions.contextEpoch, context.contextEpoch)
        )
      )
    return defaultPolicy()
  })

export const putAgentApprovalPolicyForSession = async (
  db: Db,
  input: {
    sessionId: string
    userId: string
    threadId: string
    mode: AgentThreadPermissionMode
    now?: Date
  }
): Promise<AgentApprovalPolicy> =>
  await db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const { context, live } = await requirePolicyScope(tx, { ...input, now })
    await tx
      .delete(agentThreadPermissions)
      .where(
        and(
          eq(agentThreadPermissions.organizationId, live.activeOrganizationId),
          eq(agentThreadPermissions.threadId, input.threadId),
          eq(agentThreadPermissions.sessionId, input.sessionId),
          eq(agentThreadPermissions.userId, input.userId)
        )
      )
    await tx.insert(agentThreadPermissions).values({
      id: crypto.randomUUID(),
      organizationId: live.activeOrganizationId,
      threadId: input.threadId,
      sessionId: input.sessionId,
      userId: input.userId,
      contextEpoch: context.contextEpoch,
      mode: input.mode,
      createdAt: now,
      updatedAt: now,
    })
    return {
      mode: input.mode,
      permissions: policyPermissions(input.mode),
    }
  })
