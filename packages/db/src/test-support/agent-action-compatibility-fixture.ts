import type { createClient } from "@libsql/client"
import { expect } from "vitest"

export const seedLegacyUpdateActionScope = async (
  client: ReturnType<typeof createClient>,
  now: number
) => {
  const legacyPayload = JSON.stringify({
    requestFingerprint: "a".repeat(64),
    issueId: "legacy-update-issue",
    expectedRevision: 1,
    changes: { title: "Legacy updated title" },
  })
  const legacyPreview = JSON.stringify({
    kind: "update_issue",
    destructive: false,
    title: "Legacy issue",
    issueNumber: 1,
    issueRevision: 1,
    fields: [
      {
        field: "title",
        before: "Legacy issue",
        after: "Legacy updated title",
      },
    ],
    attachments: [],
  })
  await client.batch([
    {
      sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
      args: [
        "legacy-update-user",
        "Legacy Update User",
        "legacy-update@example.test",
        1,
        now,
        now,
      ],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: [
        "legacy-update-org",
        "Legacy Update Org",
        "legacy-update-org",
        now,
      ],
    },
    {
      sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
      args: [
        "legacy-update-member",
        "legacy-update-org",
        "legacy-update-user",
        "super_admin",
        now,
      ],
    },
    {
      sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
      args: [
        "legacy-update-issue",
        "legacy-update-org",
        1,
        "Legacy issue",
        "legacy-update-user",
        now,
        now,
      ],
    },
    {
      sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id,active_organization_id) values(?,?,?,?,?,?,?)",
      args: [
        "legacy-update-session",
        now + 3_600_000,
        "legacy-update-token",
        now,
        now,
        "legacy-update-user",
        "legacy-update-org",
      ],
    },
    {
      sql: "insert into agent_session_contexts(session_id,user_id,context_epoch,updated_at) values(?,?,?,?)",
      args: ["legacy-update-session", "legacy-update-user", 1, now],
    },
    {
      sql: "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values(?,?,?,?,?,?)",
      args: [
        "legacy-update-thread",
        "legacy-update-org",
        "legacy-update-user",
        "active",
        now,
        null,
      ],
    },
    {
      sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        "legacy-update-run",
        "legacy-update-org",
        "legacy-update-thread",
        "legacy-update-run",
        "legacy-update-session",
        "legacy-update-user",
        1,
        "legacy-update-message",
        "waiting_approval",
        "chat",
        now,
        now + 300_000,
      ],
    },
    {
      sql: "insert into agent_approval_policies(id,organization_id,thread_id,session_id,user_id,context_epoch,mode,created_at,expires_at,updated_at) values(?,?,?,?,?,?,?,?,?,?)",
      args: [
        "legacy-update-policy",
        "legacy-update-org",
        "legacy-update-thread",
        "legacy-update-session",
        "legacy-update-user",
        1,
        "auto_write",
        now,
        now + 600_000,
        now,
      ],
    },
    ...(["pending", "approved", "succeeded"] as const).map((status, index) => ({
      sql: "insert into agent_actions(id,organization_id,thread_id,run_id,session_id,user_id,context_epoch,tool_call_id,kind,normalized_payload,canonical_preview,target_id,target_revision,status,decision_provenance,decision_policy_id,decided_at,idempotency_key,receipt,result_id,created_at,updated_at,expires_at,completed_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        `legacy-update-${status}`,
        "legacy-update-org",
        "legacy-update-thread",
        "legacy-update-run",
        "legacy-update-session",
        "legacy-update-user",
        1,
        `legacy-update-tool-${index}`,
        "update_issue",
        legacyPayload,
        legacyPreview,
        "legacy-update-issue",
        1,
        "pending",
        null,
        null,
        null,
        `legacy-update-idempotency-${index}`,
        null,
        null,
        now + index,
        now + 20 + index,
        now + 600_000,
        null,
      ],
    })),
    {
      sql: "update agent_actions set status = 'approved',decision_provenance = 'auto_policy',decision_policy_id = 'legacy-update-policy',decided_at = ?,updated_at = ? where id = 'legacy-update-approved'",
      args: [now + 11, now + 21],
    },
    {
      sql: "update agent_actions set status = 'approved',decision_provenance = 'auto_policy',decision_policy_id = 'legacy-update-policy',decided_at = ?,updated_at = ? where id = 'legacy-update-succeeded'",
      args: [now + 12, now + 22],
    },
    {
      sql: "update issues set title = 'Legacy updated title',updated_at = ? where id = 'legacy-update-issue'",
      args: [now + 31],
    },
    {
      sql: "update agent_actions set status = 'succeeded',receipt = ?,result_id = ?,completed_at = ?,updated_at = ? where id = 'legacy-update-succeeded'",
      args: [
        JSON.stringify({
          issueId: "legacy-update-issue",
          number: 1,
          revision: 2,
          deleted: false,
        }),
        "legacy-update-issue",
        now + 32,
        now + 32,
      ],
    },
  ])
  return { legacyPayload, legacyPreview }
}

export const assertLegacyUpdateActionCompatibility = async (
  client: ReturnType<typeof createClient>,
  legacy: Awaited<ReturnType<typeof seedLegacyUpdateActionScope>>,
  now: number
) => {
  const migrated = await client.execute(
    "select id,normalized_payload as normalizedPayload,canonical_preview as canonicalPreview,status,created_at as createdAt,updated_at as updatedAt,decided_at as decidedAt,completed_at as completedAt from agent_actions where id like 'legacy-update-%' order by id"
  )
  expect(migrated.rows).toMatchObject([
    {
      id: "legacy-update-approved",
      normalizedPayload: legacy.legacyPayload,
      canonicalPreview: legacy.legacyPreview,
      status: "approved",
      createdAt: now + 1,
      updatedAt: now + 21,
      decidedAt: now + 11,
      completedAt: null,
    },
    {
      id: "legacy-update-pending",
      normalizedPayload: legacy.legacyPayload,
      canonicalPreview: legacy.legacyPreview,
      status: "pending",
      createdAt: now,
      updatedAt: now + 20,
      decidedAt: null,
      completedAt: null,
    },
    {
      id: "legacy-update-succeeded",
      normalizedPayload: legacy.legacyPayload,
      canonicalPreview: legacy.legacyPreview,
      status: "succeeded",
      createdAt: now + 2,
      updatedAt: now + 32,
      decidedAt: now + 12,
      completedAt: now + 32,
    },
  ])
  expect(JSON.parse(String(migrated.rows[0]?.normalizedPayload))).toEqual({
    requestFingerprint: "a".repeat(64),
    issueId: "legacy-update-issue",
    expectedRevision: 1,
    changes: { title: "Legacy updated title" },
  })

  await expect(
    client.execute({
      sql: "update agent_actions set status = 'succeeded',receipt = ?,result_id = ?,completed_at = ?,updated_at = ? where id = 'legacy-update-approved'",
      args: [
        JSON.stringify({
          issueId: "legacy-update-issue",
          number: 1,
          revision: 2,
          deleted: false,
        }),
        "legacy-update-issue",
        now + 40,
        now + 40,
      ],
    })
  ).resolves.toMatchObject({ rowsAffected: 1 })
  await expect(
    client.execute(
      "update agent_actions set normalized_payload = json_set(normalized_payload, '$.operation', 'fields') where id = 'legacy-update-pending'"
    )
  ).rejects.toThrow("agent_action_payload_immutable_except_scrub")

  const scrubbedAt = now + 8 * 24 * 60 * 60 * 1000
  await expect(
    client.execute({
      sql: "update agent_actions set normalized_payload = null,canonical_preview = null,scrubbed_at = ?,updated_at = ? where id = 'legacy-update-succeeded'",
      args: [scrubbedAt, scrubbedAt],
    })
  ).resolves.toMatchObject({ rowsAffected: 1 })
  const scrubbed = await client.execute(
    "select normalized_payload as normalizedPayload,canonical_preview as canonicalPreview,scrubbed_at as scrubbedAt from agent_actions where id = 'legacy-update-succeeded'"
  )
  expect(scrubbed.rows).toEqual([
    {
      normalizedPayload: null,
      canonicalPreview: null,
      scrubbedAt,
    },
  ])
  expect((await client.execute("pragma foreign_key_check")).rows).toEqual([])
}
