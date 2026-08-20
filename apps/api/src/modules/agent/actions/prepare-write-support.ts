import type { AgentIssueActionPreview } from "@enterprise-agentic-saas/agent-contracts"
import {
  AGENT_ACTION_MAX_LIFETIME_MS,
  agentActionAssets,
  agentActions,
  agentRuns,
  type AgentActionKind,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { HttpError } from "../../../errors/http-error"
import { hashAgentToken } from "../crypto"
import {
  validateGrantInTransaction,
  type AgentTransaction,
  type ValidGrant,
} from "../threads/repository"
import {
  findApplicablePolicy,
  type AssetSnapshot,
} from "./prepare-read-support"

export const validatePrepareGrant = async (
  tx: AgentTransaction,
  grant: string,
  now: Date
) => {
  const context = await validateGrantInTransaction(tx, {
    tokenHash: await hashAgentToken(grant),
    kind: "run",
    now,
    allowTerminalRun: true,
  })
  if (
    !context.runId ||
    !context.rootRunId ||
    context.runScope !== "chat" ||
    !context.runStatus
  ) {
    throw new HttpError({ code: "conflict" })
  }
  return context
}

export const persistPreparedAction = async (
  tx: AgentTransaction,
  input: {
    context: ValidGrant
    kind: AgentActionKind
    targetId: string
    targetRevision: number | null
    normalizedPayload: Record<string, unknown>
    preview: AgentIssueActionPreview
    snapshots: AssetSnapshot[]
    idempotencyKey: string
    toolCallId: string
    now: Date
  }
) => {
  const expiresAt = new Date(
    Math.min(
      input.now.getTime() + AGENT_ACTION_MAX_LIFETIME_MS,
      ...input.snapshots.map((snapshot) => snapshot.expiresAt.getTime())
    )
  )
  if (expiresAt.getTime() <= input.now.getTime()) {
    throw new HttpError({ code: "conflict" })
  }
  const policy = await findApplicablePolicy(tx, input.context, input.now)
  const status = policy ? "approved" : "pending"
  const actionId = crypto.randomUUID()
  const rows = await tx
    .insert(agentActions)
    .values({
      id: actionId,
      organizationId: input.context.organizationId,
      threadId: input.context.threadId,
      runId: input.context.runId ?? "",
      sessionId: input.context.sessionId,
      userId: input.context.userId,
      contextEpoch: input.context.contextEpoch,
      toolCallId: input.toolCallId,
      kind: input.kind,
      normalizedPayload: input.normalizedPayload,
      canonicalPreview: input.preview,
      targetId: input.targetId,
      targetRevision: input.targetRevision,
      status,
      decisionProvenance: policy ? "auto_policy" : null,
      decisionPolicyId: policy?.id ?? null,
      decidedAt: policy ? input.now : null,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
      updatedAt: input.now,
      expiresAt,
    })
    .returning()
  const action = rows[0]
  if (!action) throw new Error("Agent action insert returned no row")

  if (input.snapshots.length > 0) {
    await tx.insert(agentActionAssets).values(
      input.snapshots.map((snapshot) => ({
        organizationId: input.context.organizationId,
        actionId,
        assetId: snapshot.assetId,
        storageObjectId: snapshot.storageObjectId,
        sourceEtag: snapshot.sourceEtag,
        sizeBytes: snapshot.sizeBytes,
        leaseExpiresAt: expiresAt,
        createdAt: input.now,
      }))
    )
  }
  if (!policy) {
    const waiting = await tx
      .update(agentRuns)
      .set({ status: "waiting_approval" })
      .where(
        and(
          eq(agentRuns.organizationId, input.context.organizationId),
          eq(agentRuns.id, input.context.runId ?? ""),
          eq(agentRuns.status, "running")
        )
      )
      .returning({ id: agentRuns.id })
    if (!waiting[0]) throw new Error("Agent run changed during prepare")
  }
  return action
}
