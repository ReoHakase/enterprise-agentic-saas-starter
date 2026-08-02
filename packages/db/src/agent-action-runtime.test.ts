import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

const insertActionFixture = async (client: ReturnType<typeof createClient>) => {
  const now = Date.now()
  await client.batch([
    {
      sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
      args: [
        "action-user",
        "Action User",
        "action-user@example.test",
        1,
        now,
        now,
      ],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: ["action-org", "Action Org", "action-org", now],
    },
    {
      sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
      args: ["action-member", "action-org", "action-user", "owner", now],
    },
    {
      sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id,active_organization_id) values(?,?,?,?,?,?,?)",
      args: [
        "action-session",
        now + 3_600_000,
        "action-session-token",
        now,
        now,
        "action-user",
        "action-org",
      ],
    },
    {
      sql: "insert into agent_session_contexts(session_id,user_id,context_epoch,updated_at) values(?,?,?,?)",
      args: ["action-session", "action-user", 1, now],
    },
    {
      sql: "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values(?,?,?,?,?,?)",
      args: ["action-thread", "action-org", "action-user", "active", now, null],
    },
    {
      sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        "action-run",
        "action-org",
        "action-thread",
        "action-run",
        "action-session",
        "action-user",
        1,
        "action-message",
        "running",
        "chat",
        now,
        now + 300_000,
      ],
    },
    {
      sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
      args: [
        "action-issue",
        "action-org",
        1,
        "Original title",
        "action-user",
        now,
        now,
      ],
    },
  ])
  return now
}

const pendingActionStatement = (input: {
  id: string
  idempotencyKey: string
  kind: "create_issue" | "update_issue" | "delete_issue"
  now: number
  targetId: string
  targetRevision?: number
  toolCallId: string
}) => ({
  sql: "insert into agent_actions(id,organization_id,thread_id,run_id,session_id,user_id,context_epoch,tool_call_id,kind,normalized_payload,canonical_preview,target_id,target_revision,status,idempotency_key,created_at,updated_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  args: [
    input.id,
    "action-org",
    "action-thread",
    "action-run",
    "action-session",
    "action-user",
    1,
    input.toolCallId,
    input.kind,
    JSON.stringify({ title: "Canonical title" }),
    JSON.stringify({ summary: "Canonical preview" }),
    input.targetId,
    input.targetRevision ?? null,
    "pending",
    input.idempotencyKey,
    input.now,
    input.now,
    input.now + 600_000,
  ],
})

describe("Agent action runtime schema", () => {
  it("guards Issue revisions, action transitions, resume replay, and context rotation", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      const now = await insertActionFixture(client)

      await client.execute(
        "update issues set title = 'Human update',updated_at = ? where id = 'action-issue'",
        [now + 1]
      )
      const revised = await client.execute(
        "select revision from issues where id = 'action-issue'"
      )
      expect(revised.rows).toMatchObject([{ revision: 2 }])
      await expect(
        client.execute(
          "update issues set revision = 4 where id = 'action-issue'"
        )
      ).rejects.toThrow(/issue_revision_must_increment_by_one/i)
      await expect(
        client.execute({
          sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "missing-message-run",
            "action-org",
            "action-thread",
            "missing-message-run",
            "action-session",
            "action-user",
            1,
            "running",
            "chat",
            now,
            now + 60_000,
          ],
        })
      ).rejects.toThrow(
        /agent_run_required_identifier_missing|check constraint/i
      )

      await client.execute(
        pendingActionStatement({
          id: "update-action",
          idempotencyKey: "update-action-key",
          kind: "update_issue",
          now,
          targetId: "action-issue",
          targetRevision: 2,
          toolCallId: "update-tool-call",
        })
      )
      await expect(
        client.execute({
          sql: "update agent_actions set status = 'succeeded',decision_provenance = 'manual',decision_idempotency_key = ?,decided_at = ?,receipt = ?,result_id = ?,completed_at = ?,updated_at = ? where id = ?",
          args: [
            "skip-decision",
            now + 1,
            JSON.stringify({ ok: true }),
            "action-issue",
            now + 2,
            now + 2,
            "update-action",
          ],
        })
      ).rejects.toThrow(/agent_action_invalid_state_transition/i)
      await client.execute({
        sql: "update agent_actions set status = 'approved',decision_provenance = 'manual',decision_idempotency_key = ?,decided_at = ?,updated_at = ? where id = ?",
        args: ["approve-update-action", now + 1, now + 1, "update-action"],
      })

      await client.execute({
        sql: "insert into agent_resume_tickets(id,token_hash,action_id,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
        args: [
          "resume-ticket-1",
          "a".repeat(64),
          "update-action",
          "action-org",
          "action-thread",
          "action-session",
          "action-user",
          1,
          now + 2,
          now + 50_000,
        ],
      })
      await expect(
        client.execute({
          sql: "insert into agent_resume_tickets(id,token_hash,action_id,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "resume-ticket-duplicate",
            "b".repeat(64),
            "update-action",
            "action-org",
            "action-thread",
            "action-session",
            "action-user",
            1,
            now + 2,
            now + 50_000,
          ],
        })
      ).rejects.toThrow(/unique/i)
      await client.execute({
        sql: "update agent_resume_tickets set consumed_at = ? where id = ?",
        args: [now + 3, "resume-ticket-1"],
      })
      await expect(
        client.execute({
          sql: "update agent_resume_tickets set consumed_at = ? where id = ?",
          args: [now + 4, "resume-ticket-1"],
        })
      ).rejects.toThrow(/agent_resume_ticket_immutable_or_replayed/i)
      await client.execute({
        sql: "insert into agent_resume_tickets(id,token_hash,action_id,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
        args: [
          "resume-ticket-2",
          "c".repeat(64),
          "update-action",
          "action-org",
          "action-thread",
          "action-session",
          "action-user",
          1,
          now + 4,
          now + 50_000,
        ],
      })

      await client.execute({
        sql: "update issues set title = ?,revision = ?,updated_at = ? where id = ? and revision = ?",
        args: ["Agent update", 3, now + 5, "action-issue", 2],
      })
      await client.execute({
        sql: "update agent_actions set status = 'succeeded',receipt = ?,result_id = ?,completed_at = ?,updated_at = ? where id = ?",
        args: [
          JSON.stringify({ kind: "updated" }),
          "action-issue",
          now + 6,
          now + 6,
          "update-action",
        ],
      })
      await expect(
        client.execute(
          "update agent_actions set status = 'canceled' where id = 'update-action'"
        )
      ).rejects.toThrow(
        /agent_action_invalid_state_transition|check constraint/i
      )

      await client.execute(
        pendingActionStatement({
          id: "switch-action",
          idempotencyKey: "switch-action-key",
          kind: "update_issue",
          now: now + 7,
          targetId: "action-issue",
          targetRevision: 3,
          toolCallId: "switch-tool-call",
        })
      )
      await client.execute({
        sql: "insert into agent_approval_policies(id,organization_id,thread_id,session_id,user_id,context_epoch,mode,created_at,expires_at,updated_at) values(?,?,?,?,?,?,?,?,?,?)",
        args: [
          "switch-policy",
          "action-org",
          "action-thread",
          "action-session",
          "action-user",
          1,
          "ask_each",
          now + 7,
          now + 60_000,
          now + 7,
        ],
      })
      await client.execute({
        sql: "update session set active_organization_id = null,updated_at = ? where id = ?",
        args: [now + 8, "action-session"],
      })

      const [context, action, run, policy, ticket] = await Promise.all([
        client.execute(
          "select context_epoch as contextEpoch from agent_session_contexts where session_id = 'action-session'"
        ),
        client.execute(
          "select status from agent_actions where id = 'switch-action'"
        ),
        client.execute("select status from agent_runs where id = 'action-run'"),
        client.execute(
          "select revoked_at as revokedAt from agent_approval_policies where id = 'switch-policy'"
        ),
        client.execute(
          "select revoked_at as revokedAt from agent_resume_tickets where id = 'resume-ticket-2'"
        ),
      ])
      expect(context.rows).toMatchObject([{ contextEpoch: 2 }])
      expect(action.rows).toMatchObject([{ status: "canceled" }])
      expect(run.rows).toMatchObject([{ status: "canceled" }])
      expect(policy.rows[0]?.revokedAt).not.toBeNull()
      expect(ticket.rows[0]?.revokedAt).not.toBeNull()
    } finally {
      client.close()
    }
  })
})

describe("Agent action runtime resource and asset invariants", () => {
  it("applies resource usage exactly once per bucket and rejects overflow", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      const now = await insertActionFixture(client)
      await client.batch([
        {
          sql: "insert into agent_resource_usage_buckets(id,organization_id,kind,window_start,window_end,limit_count,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "organization-bucket",
            "action-org",
            "write_action",
            now,
            now + 86_400_000,
            5,
            now,
          ],
        },
        {
          sql: "insert into agent_resource_usage_buckets(id,organization_id,user_id,kind,window_start,window_end,limit_count,updated_at) values(?,?,?,?,?,?,?,?)",
          args: [
            "user-bucket",
            "action-org",
            "action-user",
            "write_action",
            now,
            now + 86_400_000,
            4,
            now,
          ],
        },
        {
          sql: "insert into agent_resource_usage_operations(operation_id,organization_id,bucket_id,delta,created_at) values(?,?,?,?,?)",
          args: ["same-operation", "action-org", "organization-bucket", 3, now],
        },
        {
          sql: "insert into agent_resource_usage_operations(operation_id,organization_id,bucket_id,delta,created_at) values(?,?,?,?,?)",
          args: ["same-operation", "action-org", "user-bucket", 2, now],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into agent_resource_usage_operations(operation_id,organization_id,bucket_id,delta,created_at) values(?,?,?,?,?)",
          args: ["same-operation", "action-org", "organization-bucket", 3, now],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        client.execute({
          sql: "insert into agent_resource_usage_operations(operation_id,organization_id,bucket_id,delta,created_at) values(?,?,?,?,?)",
          args: ["overflow", "action-org", "user-bucket", 3, now + 1],
        })
      ).rejects.toThrow(/check constraint/i)
      await client.execute({
        sql: "insert into agent_resource_usage_operations(operation_id,organization_id,bucket_id,delta,created_at) values(?,?,?,?,?)",
        args: ["release", "action-org", "user-bucket", -2, now + 2],
      })
      await expect(
        client.execute(
          "update agent_resource_usage_operations set delta = 1 where operation_id = 'release' and bucket_id = 'user-bucket'"
        )
      ).rejects.toThrow(/agent_resource_usage_operation_immutable/i)

      const [buckets, overflow] = await Promise.all([
        client.execute(
          "select id,count from agent_resource_usage_buckets order by id"
        ),
        client.execute(
          "select operation_id from agent_resource_usage_operations where operation_id = 'overflow'"
        ),
      ])
      expect(buckets.rows).toMatchObject([
        { id: "organization-bucket", count: 3 },
        { id: "user-bucket", count: 0 },
      ])
      expect(overflow.rows).toHaveLength(0)
    } finally {
      client.close()
    }
  })

  it("promotes one staged asset to an Issue file in the enforced statement order", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      const now = await insertActionFixture(client)
      const objectKey = "organizations/action-org/storage-objects/action-object"
      await client.batch([
        {
          sql: "insert into organization_file_usage(organization_id,used_bytes,temporary_bytes,updated_at) values(?,?,?,?)",
          args: ["action-org", 100, 100, now],
        },
        {
          sql: "insert into storage_objects(id,organization_id,uploader_id,upload_id,object_key,size_bytes,declared_content_type,detected_image_format,image_width,image_height,etag,status,key_version,cleanup_revision,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "action-object",
            "action-org",
            "action-user",
            "action-upload",
            objectKey,
            100,
            "image/png",
            "png",
            10,
            10,
            "action-etag",
            "ready",
            2,
            0,
            now,
            now,
          ],
        },
        {
          sql: "insert into agent_assets(id,organization_id,thread_id,session_id,context_epoch,uploader_id,storage_object_id,filename,status,expires_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "action-asset",
            "action-org",
            "action-thread",
            "action-session",
            1,
            "action-user",
            "action-object",
            "screenshot.png",
            "pending",
            now + 3_600_000,
            now,
            now,
          ],
        },
        {
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type,holder_id,revision,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "action-object",
            "action-org",
            "agent_asset",
            "action-asset",
            1,
            now,
            now,
          ],
        },
        {
          sql: "update agent_assets set status = 'ready',expires_at = ?,updated_at = ? where id = ?",
          args: [now + 72 * 60 * 60 * 1000, now + 1, "action-asset"],
        },
        {
          sql: "insert into agent_run_assets(organization_id,run_id,asset_id,storage_object_id,source_etag,size_bytes,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "action-org",
            "action-run",
            "action-asset",
            "action-object",
            "action-etag",
            100,
            now + 1,
          ],
        },
        pendingActionStatement({
          id: "create-action",
          idempotencyKey: "create-action-key",
          kind: "create_issue",
          now: now + 1,
          targetId: "created-by-agent",
          toolCallId: "create-tool-call",
        }),
        {
          sql: "insert into agent_action_assets(organization_id,action_id,asset_id,storage_object_id,source_etag,size_bytes,lease_expires_at,created_at) values(?,?,?,?,?,?,?,?)",
          args: [
            "action-org",
            "create-action",
            "action-asset",
            "action-object",
            "action-etag",
            100,
            now + 240_000,
            now + 1,
          ],
        },
      ])
      await client.execute({
        sql: "update agent_actions set status = 'approved',decision_provenance = 'manual',decision_idempotency_key = ?,decided_at = ?,updated_at = ? where id = ?",
        args: ["approve-create-action", now + 2, now + 2, "create-action"],
      })

      await client.batch([
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "created-by-agent",
            "action-org",
            2,
            "Created by Agent",
            "action-user",
            now + 3,
            now + 3,
          ],
        },
        {
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,detected_image_format,image_width,image_height,etag,status,storage_object_id,key_version,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "promoted-file",
            "action-org",
            "action-user",
            "promoted-file-upload",
            "issue",
            objectKey,
            "screenshot.png",
            100,
            "image/png",
            "png",
            10,
            10,
            "action-etag",
            "pending",
            "action-object",
            2,
            now + 3,
            now + 3,
          ],
        },
        {
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: ["promoted-file", "action-org", "issue", "created-by-agent"],
        },
        {
          sql: "update agent_assets set status = 'promoting',updated_at = ? where id = ?",
          args: [now + 4, "action-asset"],
        },
        {
          sql: "update storage_object_claims set holder_type = 'transferring',holder_id = null,from_asset_id = ?,to_file_id = ?,revision = 2,updated_at = ? where storage_object_id = ?",
          args: ["action-asset", "promoted-file", now + 5, "action-object"],
        },
        {
          sql: "update storage_object_claims set holder_type = 'file',holder_id = ?,from_asset_id = null,to_file_id = null,revision = 3,updated_at = ? where storage_object_id = ?",
          args: ["promoted-file", now + 6, "action-object"],
        },
        {
          sql: "update agent_assets set status = 'promoted',storage_object_id = null,promoted_file_id = ?,updated_at = ? where id = ?",
          args: ["promoted-file", now + 7, "action-asset"],
        },
        {
          sql: "update files set status = 'ready',updated_at = ? where id = ?",
          args: [now + 8, "promoted-file"],
        },
        {
          sql: "update agent_action_assets set quota_classified_at = ? where action_id = ? and asset_id = ?",
          args: [now + 9, "create-action", "action-asset"],
        },
        {
          sql: "update agent_actions set status = 'succeeded',receipt = ?,result_id = ?,completed_at = ?,updated_at = ? where id = ?",
          args: [
            JSON.stringify({ kind: "created" }),
            "created-by-agent",
            now + 10,
            now + 10,
            "create-action",
          ],
        },
      ])

      const [action, asset, file, claim, usage, lease] = await Promise.all([
        client.execute(
          "select status,result_id as resultId from agent_actions where id = 'create-action'"
        ),
        client.execute(
          "select status,storage_object_id as storageObjectId,promoted_file_id as promotedFileId from agent_assets where id = 'action-asset'"
        ),
        client.execute(
          "select status,storage_object_id as storageObjectId from files where id = 'promoted-file'"
        ),
        client.execute(
          "select holder_type as holderType,holder_id as holderId,revision from storage_object_claims where storage_object_id = 'action-object'"
        ),
        client.execute(
          "select used_bytes as usedBytes,temporary_bytes as temporaryBytes from organization_file_usage where organization_id = 'action-org'"
        ),
        client.execute(
          "select released_at as releasedAt,quota_classified_at as quotaClassifiedAt from agent_action_assets where action_id = 'create-action'"
        ),
      ])
      expect(action.rows).toMatchObject([
        { status: "succeeded", resultId: "created-by-agent" },
      ])
      expect(asset.rows).toMatchObject([
        {
          status: "promoted",
          storageObjectId: null,
          promotedFileId: "promoted-file",
        },
      ])
      expect(file.rows).toMatchObject([
        { status: "ready", storageObjectId: "action-object" },
      ])
      expect(claim.rows).toMatchObject([
        { holderType: "file", holderId: "promoted-file", revision: 3 },
      ])
      expect(usage.rows).toMatchObject([{ usedBytes: 100, temporaryBytes: 0 }])
      expect(lease.rows[0]?.releasedAt).not.toBeNull()
      expect(lease.rows[0]?.quotaClassifiedAt).not.toBeNull()

      await client.execute("delete from files where id = 'promoted-file'")
      const [detached, claims] = await Promise.all([
        client.execute(
          "select status,promoted_file_id as promotedFileId from agent_assets where id = 'action-asset'"
        ),
        client.execute(
          "select storage_object_id from storage_object_claims where storage_object_id = 'action-object'"
        ),
      ])
      expect(detached.rows).toMatchObject([
        { status: "deleted", promotedFileId: null },
      ])
      expect(claims.rows).toHaveLength(0)

      await client.execute(
        "update storage_objects set status = 'deleting',cleanup_revision = 1 where id = 'action-object'"
      )
      await client.execute(
        "update storage_objects set status = 'deleted',object_key = null where id = 'action-object'"
      )
      await client.execute(
        "delete from storage_objects where id = 'action-object'"
      )
      const snapshots = await client.execute(
        "select storage_object_id as storageObjectId from agent_action_assets where action_id = 'create-action'"
      )
      expect(snapshots.rows).toMatchObject([{ storageObjectId: null }])
    } finally {
      client.close()
    }
  })
})
