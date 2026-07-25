import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { agentApprovalPolicies } from "./agent-policies"
import { agentRuns } from "./agent-runs"
import { organization } from "./auth.generated"
import {
  AGENT_ACTION_MAX_LIFETIME_MS,
  AGENT_RESUME_TICKET_MAX_LIFETIME_MS,
} from "./values"
import type {
  AgentActionKind,
  AgentActionStatus,
  AgentDecisionProvenance,
  AgentActionDocument,
} from "./values"

export const agentActions = sqliteTable(
  "agent_actions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    runId: text("run_id").notNull(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").notNull(),
    contextEpoch: integer("context_epoch").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    kind: text("kind").$type<AgentActionKind>().notNull(),
    normalizedPayload: text("normalized_payload", {
      mode: "json",
    }).$type<AgentActionDocument>(),
    canonicalPreview: text("canonical_preview", {
      mode: "json",
    }).$type<AgentActionDocument>(),
    targetType: text("target_type").$type<"issue">().notNull().default("issue"),
    targetId: text("target_id").notNull(),
    targetRevision: integer("target_revision"),
    status: text("status")
      .$type<AgentActionStatus>()
      .notNull()
      .default("pending"),
    decisionProvenance: text(
      "decision_provenance"
    ).$type<AgentDecisionProvenance>(),
    decisionPolicyId: text("decision_policy_id"),
    decisionIdempotencyKey: text("decision_idempotency_key"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    idempotencyKey: text("idempotency_key").notNull(),
    receipt: text("receipt", { mode: "json" }).$type<AgentActionDocument>(),
    resultId: text("result_id"),
    errorClassification: text("error_classification"),
    attempt: integer("attempt").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    scrubbedAt: integer("scrubbed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_actions_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("agent_actions_resume_scope_uidx").on(
      table.organizationId,
      table.id,
      table.threadId,
      table.sessionId,
      table.userId,
      table.contextEpoch
    ),
    uniqueIndex("agent_actions_idempotency_uidx").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("agent_actions_run_tool_call_uidx").on(
      table.organizationId,
      table.runId,
      table.toolCallId
    ),
    uniqueIndex("agent_actions_decision_idempotency_uidx")
      .on(table.organizationId, table.decisionIdempotencyKey)
      .where(sql`${table.decisionIdempotencyKey} is not null`),
    index("agent_actions_thread_status_created_idx").on(
      table.organizationId,
      table.threadId,
      table.status,
      table.createdAt
    ),
    index("agent_actions_session_epoch_status_idx").on(
      table.sessionId,
      table.contextEpoch,
      table.status
    ),
    index("agent_actions_expiry_idx").on(table.status, table.expiresAt),
    index("agent_actions_target_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId
    ),
    foreignKey({
      columns: [
        table.organizationId,
        table.runId,
        table.threadId,
        table.sessionId,
        table.userId,
        table.contextEpoch,
      ],
      foreignColumns: [
        agentRuns.organizationId,
        agentRuns.id,
        agentRuns.threadId,
        agentRuns.sessionId,
        agentRuns.userId,
        agentRuns.contextEpoch,
      ],
      name: "agent_actions_run_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.decisionPolicyId,
        table.threadId,
        table.sessionId,
        table.userId,
        table.contextEpoch,
      ],
      foreignColumns: [
        agentApprovalPolicies.organizationId,
        agentApprovalPolicies.id,
        agentApprovalPolicies.threadId,
        agentApprovalPolicies.sessionId,
        agentApprovalPolicies.userId,
        agentApprovalPolicies.contextEpoch,
      ],
      name: "agent_actions_policy_scope_fk",
    }),
    check(
      "agent_actions_kind_check",
      sql`${table.kind} in ('create_issue', 'update_issue', 'delete_issue')`
    ),
    check(
      "agent_actions_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'expired', 'canceled', 'succeeded', 'conflicted')`
    ),
    check("agent_actions_epoch_check", sql`${table.contextEpoch} >= 1`),
    check(
      "agent_actions_tool_call_id_check",
      sql`length(${table.toolCallId}) between 1 and 128`
    ),
    check(
      "agent_actions_target_check",
      sql`${table.targetType} = 'issue'
        and length(${table.targetId}) between 1 and 128
        and (
          (${table.kind} = 'create_issue' and ${table.targetRevision} is null)
          or (
            ${table.kind} in ('update_issue', 'delete_issue')
            and ${table.targetRevision} is not null
            and ${table.targetRevision} >= 1
          )
        )`
    ),
    check(
      "agent_actions_payload_check",
      sql`(
        ${table.normalizedPayload} is not null
        and json_valid(${table.normalizedPayload})
        and ${table.canonicalPreview} is not null
        and json_valid(${table.canonicalPreview})
        and ${table.scrubbedAt} is null
      ) or (
        ${table.normalizedPayload} is null
        and ${table.canonicalPreview} is null
        and ${table.scrubbedAt} is not null
        and ${table.status} in ('rejected', 'expired', 'canceled', 'succeeded', 'conflicted')
      )`
    ),
    check(
      "agent_actions_decision_check",
      sql`(
        ${table.decisionProvenance} is null
        and ${table.decisionPolicyId} is null
        and ${table.decisionIdempotencyKey} is null
        and ${table.decidedAt} is null
      ) or (
        ${table.decisionProvenance} = 'manual'
        and ${table.decisionPolicyId} is null
        and ${table.decisionIdempotencyKey} is not null
        and length(${table.decisionIdempotencyKey}) between 1 and 128
        and ${table.decidedAt} is not null
      ) or (
        ${table.decisionProvenance} = 'auto_policy'
        and ${table.decisionPolicyId} is not null
        and ${table.decisionIdempotencyKey} is null
        and ${table.decidedAt} is not null
      )`
    ),
    check(
      "agent_actions_status_shape_check",
      sql`(
        ${table.status} = 'pending'
        and ${table.decisionProvenance} is null
        and ${table.completedAt} is null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} = 'approved'
        and ${table.decisionProvenance} is not null
        and ${table.completedAt} is null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} = 'rejected'
        and ${table.decisionProvenance} = 'manual'
        and ${table.completedAt} is not null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} in ('expired', 'canceled')
        and ${table.completedAt} is not null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} = 'conflicted'
        and ${table.decisionProvenance} is not null
        and ${table.completedAt} is not null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is not null
      ) or (
        ${table.status} = 'succeeded'
        and ${table.decisionProvenance} is not null
        and ${table.completedAt} is not null
        and ${table.receipt} is not null
        and json_valid(${table.receipt})
        and ${table.resultId} is not null
        and ${table.errorClassification} is null
      )`
    ),
    check(
      "agent_actions_idempotency_key_check",
      sql`length(${table.idempotencyKey}) between 1 and 128`
    ),
    check(
      "agent_actions_result_id_check",
      sql`${table.resultId} is null or length(${table.resultId}) between 1 and 128`
    ),
    check(
      "agent_actions_error_classification_check",
      sql`${table.errorClassification} is null or (
        length(${table.errorClassification}) between 1 and 96
        and ${table.errorClassification} glob '[A-Za-z]*'
        and ${table.errorClassification} not glob '*[^A-Za-z0-9_.:-]*'
      )`
    ),
    check("agent_actions_attempt_check", sql`${table.attempt} >= 0`),
    check(
      "agent_actions_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}
        and ${table.expiresAt} <= ${table.createdAt} + ${sql.raw(String(AGENT_ACTION_MAX_LIFETIME_MS))}`
    ),
    check(
      "agent_actions_timestamps_check",
      sql`(${table.decidedAt} is null or (
          ${table.decidedAt} >= ${table.createdAt}
          and ${table.decidedAt} <= ${table.expiresAt}
        ))
        and (${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt})
        and (${table.scrubbedAt} is null or (
          ${table.completedAt} is not null
          and ${table.scrubbedAt} >= ${table.completedAt}
        ))`
    ),
  ]
)

export const agentResumeTickets = sqliteTable(
  "agent_resume_tickets",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    actionId: text("action_id").notNull(),
    organizationId: text("organization_id").notNull(),
    threadId: text("thread_id").notNull(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").notNull(),
    contextEpoch: integer("context_epoch").notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_resume_tickets_hash_uidx").on(table.tokenHash),
    uniqueIndex("agent_resume_tickets_active_action_uidx")
      .on(table.organizationId, table.actionId)
      .where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
    index("agent_resume_tickets_expiry_idx").on(table.expiresAt),
    index("agent_resume_tickets_action_idx").on(
      table.organizationId,
      table.actionId
    ),
    index("agent_resume_tickets_session_epoch_idx").on(
      table.sessionId,
      table.contextEpoch
    ),
    foreignKey({
      columns: [
        table.organizationId,
        table.actionId,
        table.threadId,
        table.sessionId,
        table.userId,
        table.contextEpoch,
      ],
      foreignColumns: [
        agentActions.organizationId,
        agentActions.id,
        agentActions.threadId,
        agentActions.sessionId,
        agentActions.userId,
        agentActions.contextEpoch,
      ],
      name: "agent_resume_tickets_action_scope_fk",
    }).onDelete("cascade"),
    check(
      "agent_resume_tickets_hash_check",
      sql`length(${table.tokenHash}) = 64
        and ${table.tokenHash} not glob '*[^0-9a-f]*'`
    ),
    check("agent_resume_tickets_epoch_check", sql`${table.contextEpoch} >= 1`),
    check(
      "agent_resume_tickets_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt}
        and ${table.expiresAt} <= ${table.issuedAt} + ${sql.raw(String(AGENT_RESUME_TICKET_MAX_LIFETIME_MS))}`
    ),
    check(
      "agent_resume_tickets_terminal_check",
      sql`not (
        ${table.consumedAt} is not null
        and ${table.revokedAt} is not null
      )
      and (${table.consumedAt} is null or ${table.consumedAt} >= ${table.issuedAt})
      and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.issuedAt})`
    ),
  ]
)
