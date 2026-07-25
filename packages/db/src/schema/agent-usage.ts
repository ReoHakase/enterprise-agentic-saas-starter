import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { agentRuns } from "./agent-runs"
import { organization, user } from "./auth.generated"
import { ORGANIZATION_FILE_QUOTA_BYTES } from "./values"
import type { AgentResourceUsageKind } from "./values"

export const agentUsageEvents = sqliteTable(
  "agent_usage_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    runId: text("run_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokenCount: integer("input_token_count").notNull().default(0),
    inputNoCacheTokenCount: integer("input_no_cache_token_count")
      .notNull()
      .default(0),
    cacheReadTokenCount: integer("cache_read_token_count").notNull().default(0),
    cacheWriteTokenCount: integer("cache_write_token_count")
      .notNull()
      .default(0),
    outputTokenCount: integer("output_token_count").notNull().default(0),
    textOutputTokenCount: integer("text_output_token_count")
      .notNull()
      .default(0),
    reasoningTokenCount: integer("reasoning_token_count").notNull().default(0),
    totalTokenCount: integer("total_token_count").notNull().default(0),
    imageInputCount: integer("image_input_count").notNull().default(0),
    calculatedCostMicros: integer("calculated_cost_micros")
      .notNull()
      .default(0),
    providerCostMicros: integer("provider_cost_micros"),
    pricingVersion: text("pricing_version").notNull().default("unpriced"),
    currency: text("currency").notNull().default("USD"),
    isEstimate: integer("is_estimate", { mode: "boolean" })
      .notNull()
      .default(false),
    durationMs: integer("duration_ms").notNull(),
    providerRequestId: text("provider_request_id"),
    runEventId: text("run_event_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_usage_events_provider_request_uidx")
      .on(table.organizationId, table.provider, table.providerRequestId)
      .where(sql`${table.providerRequestId} is not null`),
    uniqueIndex("agent_usage_events_run_event_uidx")
      .on(table.organizationId, table.runId, table.runEventId)
      .where(sql`${table.runEventId} is not null`),
    index("agent_usage_events_run_created_idx").on(
      table.organizationId,
      table.runId,
      table.createdAt
    ),
    foreignKey({
      columns: [table.organizationId, table.runId, table.threadId],
      foreignColumns: [
        agentRuns.organizationId,
        agentRuns.id,
        agentRuns.threadId,
      ],
      name: "agent_usage_events_run_scope_fk",
    }).onDelete("cascade"),
    check(
      "agent_usage_events_provider_check",
      sql`length(${table.provider}) between 1 and 64`
    ),
    check(
      "agent_usage_events_model_check",
      sql`length(${table.model}) between 1 and 160`
    ),
    check(
      "agent_usage_events_counts_check",
      sql`${table.inputTokenCount} >= 0
        and ${table.inputNoCacheTokenCount} >= 0
        and ${table.cacheReadTokenCount} >= 0
        and ${table.cacheWriteTokenCount} >= 0
        and ${table.outputTokenCount} >= 0
        and ${table.textOutputTokenCount} >= 0
        and ${table.reasoningTokenCount} >= 0
        and ${table.totalTokenCount} >= 0
        and ${table.imageInputCount} >= 0
        and ${table.calculatedCostMicros} >= 0
        and (${table.providerCostMicros} is null or ${table.providerCostMicros} >= 0)
        and ${table.durationMs} between 0 and 300000`
    ),
    check(
      "agent_usage_events_token_shape_check",
      sql`${table.inputNoCacheTokenCount} + ${table.cacheReadTokenCount} + ${table.cacheWriteTokenCount} <= ${table.inputTokenCount}
        and ${table.textOutputTokenCount} + ${table.reasoningTokenCount} <= ${table.outputTokenCount}
        and ${table.totalTokenCount} = ${table.inputTokenCount} + ${table.outputTokenCount}`
    ),
    check(
      "agent_usage_events_billing_check",
      sql`length(${table.pricingVersion}) between 1 and 160
        and ${table.currency} = 'USD'`
    ),
    check(
      "agent_usage_events_idempotency_check",
      sql`(
        ${table.providerRequestId} is not null
        and length(${table.providerRequestId}) between 1 and 160
      ) or (
        ${table.runEventId} is not null
        and length(${table.runEventId}) between 1 and 160
      )`
    ),
  ]
)

export const agentModelPrices = sqliteTable(
  "agent_model_prices",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    pricingVersion: text("pricing_version").notNull(),
    effectiveFrom: integer("effective_from", {
      mode: "timestamp_ms",
    }).notNull(),
    effectiveTo: integer("effective_to", { mode: "timestamp_ms" }),
    inputPriceMicrosPerMillion: integer(
      "input_price_micros_per_million"
    ).notNull(),
    cacheReadPriceMicrosPerMillion: integer(
      "cache_read_price_micros_per_million"
    ).notNull(),
    cacheWritePriceMicrosPerMillion: integer(
      "cache_write_price_micros_per_million"
    ).notNull(),
    outputPriceMicrosPerMillion: integer(
      "output_price_micros_per_million"
    ).notNull(),
    tierThresholdTokenCount: integer("tier_threshold_token_count"),
    tierInputPriceMicrosPerMillion: integer(
      "tier_input_price_micros_per_million"
    ),
    tierCacheReadPriceMicrosPerMillion: integer(
      "tier_cache_read_price_micros_per_million"
    ),
    tierCacheWritePriceMicrosPerMillion: integer(
      "tier_cache_write_price_micros_per_million"
    ),
    tierOutputPriceMicrosPerMillion: integer(
      "tier_output_price_micros_per_million"
    ),
    currency: text("currency").notNull().default("USD"),
  },
  (table) => [
    uniqueIndex("agent_model_prices_version_uidx").on(
      table.provider,
      table.model,
      table.pricingVersion
    ),
    index("agent_model_prices_effective_idx").on(
      table.provider,
      table.model,
      table.effectiveFrom
    ),
    check(
      "agent_model_prices_values_check",
      sql`length(${table.provider}) between 1 and 64
        and length(${table.model}) between 1 and 160
        and length(${table.pricingVersion}) between 1 and 160
        and (${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom})
        and ${table.inputPriceMicrosPerMillion} >= 0
        and ${table.cacheReadPriceMicrosPerMillion} >= 0
        and ${table.cacheWritePriceMicrosPerMillion} >= 0
        and ${table.outputPriceMicrosPerMillion} >= 0
        and (
          (${table.tierThresholdTokenCount} is null
            and ${table.tierInputPriceMicrosPerMillion} is null
            and ${table.tierCacheReadPriceMicrosPerMillion} is null
            and ${table.tierCacheWritePriceMicrosPerMillion} is null
            and ${table.tierOutputPriceMicrosPerMillion} is null)
          or
          (${table.tierThresholdTokenCount} >= 1
            and ${table.tierInputPriceMicrosPerMillion} >= 0
            and ${table.tierCacheReadPriceMicrosPerMillion} >= 0
            and ${table.tierCacheWritePriceMicrosPerMillion} >= 0
            and ${table.tierOutputPriceMicrosPerMillion} >= 0)
        )
        and ${table.currency} = 'USD'`
    ),
  ]
)

export const agentUsageDaily = sqliteTable(
  "agent_usage_daily",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    runCount: integer("run_count").notNull().default(0),
    inputTokenCount: integer("input_token_count").notNull().default(0),
    outputTokenCount: integer("output_token_count").notNull().default(0),
    reasoningTokenCount: integer("reasoning_token_count").notNull().default(0),
    totalTokenCount: integer("total_token_count").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_usage_daily_scope_uidx").on(
      table.date,
      table.organizationId,
      table.userId,
      table.provider,
      table.model
    ),
    index("agent_usage_daily_organization_date_idx").on(
      table.organizationId,
      table.date
    ),
    check(
      "agent_usage_daily_values_check",
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        and length(${table.provider}) between 1 and 64
        and length(${table.model}) between 1 and 160
        and ${table.runCount} >= 0
        and ${table.inputTokenCount} >= 0
        and ${table.outputTokenCount} >= 0
        and ${table.reasoningTokenCount} >= 0
        and ${table.totalTokenCount} = ${table.inputTokenCount} + ${table.outputTokenCount}
        and ${table.costMicros} >= 0`
    ),
  ]
)

export const agentResourceUsageBuckets = sqliteTable(
  "agent_resource_usage_buckets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<AgentResourceUsageKind>().notNull(),
    windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
    windowEnd: integer("window_end", { mode: "timestamp_ms" }).notNull(),
    count: integer("count").notNull().default(0),
    limitCount: integer("limit_count").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_resource_usage_buckets_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("agent_resource_usage_buckets_organization_scope_uidx")
      .on(table.organizationId, table.kind, table.windowStart)
      .where(sql`${table.userId} is null`),
    uniqueIndex("agent_resource_usage_buckets_user_scope_uidx")
      .on(table.organizationId, table.userId, table.kind, table.windowStart)
      .where(sql`${table.userId} is not null`),
    index("agent_resource_usage_buckets_window_end_idx").on(table.windowEnd),
    check(
      "agent_resource_usage_buckets_kind_check",
      sql`${table.kind} in ('asset_upload', 'vision_transform', 'write_action', 'staged_asset', 'pending_upload', 'model_run', 'web_search')`
    ),
    check(
      "agent_resource_usage_buckets_window_check",
      sql`${table.windowEnd} > ${table.windowStart}`
    ),
    check(
      "agent_resource_usage_buckets_count_check",
      sql`${table.limitCount} >= 0 and ${table.count} between 0 and ${table.limitCount}`
    ),
  ]
)

export const agentResourceUsageOperations = sqliteTable(
  "agent_resource_usage_operations",
  {
    operationId: text("operation_id").notNull(),
    organizationId: text("organization_id").notNull(),
    bucketId: text("bucket_id").notNull(),
    delta: integer("delta").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.bucketId, table.operationId],
      name: "agent_resource_usage_operations_pk",
    }),
    index("agent_resource_usage_operations_bucket_created_idx").on(
      table.organizationId,
      table.bucketId,
      table.createdAt
    ),
    foreignKey({
      columns: [table.organizationId, table.bucketId],
      foreignColumns: [
        agentResourceUsageBuckets.organizationId,
        agentResourceUsageBuckets.id,
      ],
      name: "agent_resource_usage_operations_bucket_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_resource_usage_operations_id_check",
      sql`length(${table.operationId}) between 1 and 160`
    ),
    check(
      "agent_resource_usage_operations_delta_check",
      sql`${table.delta} between -${sql.raw(String(ORGANIZATION_FILE_QUOTA_BYTES))} and ${sql.raw(String(ORGANIZATION_FILE_QUOTA_BYTES))}
        and ${table.delta} != 0`
    ),
  ]
)
