import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

const migrationsFolder = new URL("../drizzle-v3", import.meta.url).pathname

const insertStorageFixture = async (
  client: ReturnType<typeof createClient>
) => {
  const now = Date.now()
  await client.batch([
    {
      sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
      args: [
        "storage-user",
        "Storage User",
        "storage-user@example.test",
        1,
        now,
        now,
      ],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: ["storage-org-a", "Storage Org A", "storage-org-a", now],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: ["storage-org-b", "Storage Org B", "storage-org-b", now],
    },
    {
      sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id,active_organization_id) values(?,?,?,?,?,?,?)",
      args: [
        "storage-session",
        now + 3_600_000,
        "storage-session-token",
        now,
        now,
        "storage-user",
        "storage-org-a",
      ],
    },
    {
      sql: "insert into agent_session_contexts(session_id,user_id,context_epoch,updated_at) values(?,?,?,?)",
      args: ["storage-session", "storage-user", 1, now],
    },
    {
      sql: "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values(?,?,?,?,?,?)",
      args: [
        "storage-thread-a",
        "storage-org-a",
        "storage-user",
        "active",
        now,
        null,
      ],
    },
    {
      sql: "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values(?,?,?,?,?,?)",
      args: [
        "storage-thread-b",
        "storage-org-b",
        "storage-user",
        "active",
        now,
        null,
      ],
    },
    {
      sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        "storage-run-count",
        "storage-org-a",
        "storage-thread-a",
        "storage-run-count",
        "storage-session",
        "storage-user",
        1,
        "storage-message-count",
        "running",
        "chat",
        now,
        now + 300_000,
      ],
    },
    {
      sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        "storage-run-bytes",
        "storage-org-a",
        "storage-thread-a",
        "storage-run-bytes",
        "storage-session",
        "storage-user",
        1,
        "storage-message-bytes",
        "running",
        "chat",
        now,
        now + 300_000,
      ],
    },
  ])
  return now
}

const storageObjectStatement = (input: {
  id: string
  now: number
  organizationId?: string
  sizeBytes?: number
}) => ({
  sql: "insert into storage_objects(id,organization_id,uploader_id,upload_id,object_key,size_bytes,declared_content_type,detected_image_format,image_width,image_height,etag,status,key_version,cleanup_revision,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  args: [
    input.id,
    input.organizationId ?? "storage-org-a",
    "storage-user",
    `upload-${input.id}`,
    `organizations/${input.organizationId ?? "storage-org-a"}/storage-objects/${input.id}`,
    input.sizeBytes ?? 1,
    "image/png",
    "png",
    1,
    1,
    `etag-${input.id}`,
    "ready",
    2,
    0,
    input.now,
    input.now,
  ],
})

const agentAssetStatement = (input: {
  id: string
  now: number
  organizationId?: string
  storageObjectId?: string
  threadId?: string
}) => ({
  sql: "insert into agent_assets(id,organization_id,thread_id,session_id,context_epoch,uploader_id,storage_object_id,filename,status,expires_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
  args: [
    input.id,
    input.organizationId ?? "storage-org-a",
    input.threadId ?? "storage-thread-a",
    "storage-session",
    1,
    "storage-user",
    input.storageObjectId ?? input.id,
    `${input.id}.png`,
    "pending",
    input.now + 72 * 60 * 60 * 1000,
    input.now,
    input.now,
  ],
})

const withStorageFixture = async (
  run: (client: ReturnType<typeof createClient>, now: number) => Promise<void>
) => {
  const client = createClient({ url: "file::memory:" })
  try {
    await migrate(drizzle({ client }), { migrationsFolder })
    await run(client, await insertStorageFixture(client))
  } finally {
    client.close()
  }
}

const cleanupObjectKey =
  "organizations/storage-org-a/storage-objects/cleanup-object"

const insertDeletingCleanupObject = async (
  client: ReturnType<typeof createClient>,
  now: number
) => {
  await client.execute(storageObjectStatement({ id: "cleanup-object", now }))
  await client.execute(
    "update storage_objects set status = 'deleting',cleanup_revision = 1 where id = 'cleanup-object'"
  )
}

const storageCleanupJobStatement = (input: {
  id: string
  expectedCleanupRevision?: number
  objectKey?: string
}) => ({
  sql: "insert into storage_object_cleanup_jobs(id,organization_id,storage_object_id,expected_cleanup_revision,object_key) values(?,?,?,?,?)",
  args: [
    input.id,
    "storage-org-a",
    "cleanup-object",
    input.expectedCleanupRevision ?? 1,
    input.objectKey ?? cleanupObjectKey,
  ],
})

describe("Agent storage拡張schema", () => {
  it("物理objectのcurrent claimを1件に保つ", async () => {
    await withStorageFixture(async (client, now) => {
      await client.batch([
        storageObjectStatement({ id: "storage-object-a", now }),
        agentAssetStatement({
          id: "storage-asset-a",
          now,
          storageObjectId: "storage-object-a",
        }),
        {
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type,holder_id,revision,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-object-a",
            "storage-org-a",
            "agent_asset",
            "storage-asset-a",
            1,
            now,
            now,
          ],
        },
        {
          sql: "update agent_assets set status = 'ready', updated_at = ? where id = ?",
          args: [now, "storage-asset-a"],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type,holder_id) values(?,?,?,?)",
          args: ["storage-object-a", "storage-org-a", "file", "some-file"],
        })
      ).rejects.toThrow(/unique|storage_object_claim_file_mismatch/i)
    })
  })

  it("別tenantの物理objectをAgent assetへ割り当てない", async () => {
    await withStorageFixture(async (client, now) => {
      await client.execute(
        storageObjectStatement({ id: "storage-object-cross", now })
      )
      await expect(
        client.execute({
          sql: "insert into agent_assets(id,organization_id,thread_id,session_id,context_epoch,uploader_id,storage_object_id,filename,status,expires_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "cross-tenant-asset",
            "storage-org-b",
            "storage-thread-b",
            "storage-session",
            1,
            "storage-user",
            "storage-object-cross",
            "cross.png",
            "pending",
            now + 60_000,
            now,
            now,
          ],
        })
      ).rejects.toThrow(/foreign key|agent_asset_invalid_initial_state/i)
    })
  })

  it("claimのtenantとholderを同じ物理objectへ固定する", async () => {
    await withStorageFixture(async (client, now) => {
      await client.batch([
        storageObjectStatement({ id: "storage-object-a", now }),
        storageObjectStatement({
          id: "storage-object-b",
          now,
          organizationId: "storage-org-b",
        }),
        agentAssetStatement({
          id: "storage-asset-a",
          now,
          storageObjectId: "storage-object-a",
        }),
        agentAssetStatement({
          id: "storage-asset-b",
          now,
          organizationId: "storage-org-b",
          storageObjectId: "storage-object-b",
          threadId: "storage-thread-b",
        }),
        {
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type,holder_id) values(?,?,?,?),(?,?,?,?)",
          args: [
            "storage-object-a",
            "storage-org-a",
            "agent_asset",
            "storage-asset-a",
            "storage-object-b",
            "storage-org-b",
            "agent_asset",
            "storage-asset-b",
          ],
        },
      ])
      await expect(
        client.execute({
          sql: "update storage_object_claims set organization_id = ?, holder_id = ? where storage_object_id = ?",
          args: ["storage-org-a", "storage-asset-a", "storage-object-b"],
        })
      ).rejects.toThrow(
        /unique|foreign key|claim_requires_live|claim_invalid_revision/i
      )
    })
  })

  it("対応するfileがないfile claimを拒否する", async () => {
    await withStorageFixture(async (client, now) => {
      await client.execute(
        storageObjectStatement({ id: "storage-object-cross", now })
      )
      await expect(
        client.execute({
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type) values(?,?,?)",
          args: ["storage-object-cross", "storage-org-a", "file"],
        })
      ).rejects.toThrow(
        /check constraint|file_v2_invalid_initial_state|storage_object_claim_file_mismatch/i
      )
    })
  })

  it("物理objectをdeletingへ移す場合はcleanup revisionを要求する", async () => {
    await withStorageFixture(async (client, now) => {
      await client.execute(
        storageObjectStatement({ id: "storage-object-cross", now })
      )
      await expect(
        client.execute(
          "update storage_objects set status = 'deleting' where id = 'storage-object-cross'"
        )
      ).rejects.toThrow(/storage_object_invalid_state_transition/i)
    })
  })

  it("deleting状態の物理objectへ新しいclaimを作らない", async () => {
    await withStorageFixture(async (client, now) => {
      await client.execute(
        storageObjectStatement({ id: "storage-object-cross", now })
      )
      await client.execute(
        "update storage_objects set status = 'deleting',cleanup_revision = 1 where id = 'storage-object-cross'"
      )
      await expect(
        client.execute({
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type,holder_id) values(?,?,?,?)",
          args: ["storage-object-cross", "storage-org-a", "file", "some-file"],
        })
      ).rejects.toThrow(
        /storage_object_claim_requires_live_object|storage_object_claim_file_mismatch/i
      )
    })
  })

  it("storage objectなしでready Agent assetを作らない", async () => {
    await withStorageFixture(async (client, now) => {
      await expect(
        client.execute({
          sql: "insert into agent_assets(id,organization_id,thread_id,session_id,context_epoch,uploader_id,filename,status,expires_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "ready-without-storage",
            "storage-org-a",
            "storage-thread-a",
            "storage-session",
            1,
            "storage-user",
            "missing.png",
            "ready",
            now + 60_000,
            now,
            now,
          ],
        })
      ).rejects.toThrow(
        /check constraint|file_v2_invalid_initial_state|agent_asset_invalid_initial_state/i
      )
    })
  })

  it("session削除後もready assetを残してsession参照だけを外す", async () => {
    await withStorageFixture(async (client, now) => {
      await client.batch([
        storageObjectStatement({ id: "storage-object-a", now }),
        agentAssetStatement({
          id: "storage-asset-a",
          now,
          storageObjectId: "storage-object-a",
        }),
        {
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type,holder_id,revision,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-object-a",
            "storage-org-a",
            "agent_asset",
            "storage-asset-a",
            1,
            now,
            now,
          ],
        },
        {
          sql: "update agent_assets set status = 'ready', updated_at = ? where id = ?",
          args: [now, "storage-asset-a"],
        },
      ])
      await client.execute("delete from session where id = 'storage-session'")
      const asset = await client.execute(
        "select session_id as sessionId,status from agent_assets where id = 'storage-asset-a'"
      )
      expect(asset.rows).toMatchObject([{ sessionId: null, status: "ready" }])
    })
  })

  it("v2 fileのstorage object対応関係を強制する", async () => {
    await withStorageFixture(async (client, now) => {
      await client.execute({
        ...storageObjectStatement({ id: "file-storage-object", now }),
      })

      await expect(
        client.execute({
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,status,storage_object_id) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "invalid-v2-file",
            "storage-org-a",
            "storage-user",
            "invalid-v2-upload",
            "issue",
            "organizations/storage-org-a/files/issue/owner/invalid-v2-file",
            "invalid.png",
            1,
            "image/png",
            "pending",
            "file-storage-object",
          ],
        })
      ).rejects.toThrow(/check constraint|file_v2_invalid_initial_state/i)

      await expect(
        client.execute({
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,detected_image_format,image_width,image_height,etag,status,storage_object_id,key_version) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "v2-file",
            "storage-org-a",
            "storage-user",
            "v2-upload",
            "issue",
            "organizations/storage-org-a/storage-objects/file-storage-object",
            "v2.txt",
            1,
            "image/png",
            "png",
            1,
            1,
            "etag-file-storage-object",
            "pending",
            "file-storage-object",
            2,
          ],
        })
      ).resolves.toBeDefined()
    })
  })

  it("移行中の旧fileをstorage objectなしで読めるままにする", async () => {
    await withStorageFixture(async (client) => {
      await expect(
        client.execute({
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,status) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "rolling-v1-file",
            "storage-org-a",
            "storage-user",
            "rolling-v1-upload",
            "issue",
            "organizations/storage-org-a/files/issue/owner/rolling-v1-file",
            "legacy.txt",
            1,
            "text/plain",
            "pending",
          ],
        })
      ).resolves.toBeDefined()

      const rolling = await client.execute(
        "select storage_object_id as storageObjectId,key_version as keyVersion,object_key as objectKey from files where id = 'rolling-v1-file'"
      )
      expect(rolling.rows).toMatchObject([
        {
          storageObjectId: null,
          keyVersion: null,
          objectKey:
            "organizations/storage-org-a/files/issue/owner/rolling-v1-file",
        },
      ])
    })
  })

  it.each([
    {
      label: "temporary bytesがused bytesを超える更新",
      sql: "update organization_file_usage set temporary_bytes = 101 where organization_id = 'storage-org-a'",
    },
    {
      label: "used bytesがtemporary bytesを下回る更新",
      sql: "update organization_file_usage set used_bytes = 39 where organization_id = 'storage-org-a'",
    },
  ])("$labelを拒否する", async ({ sql }) => {
    await withStorageFixture(async (client) => {
      await client.execute({
        sql: "insert into organization_file_usage(organization_id,used_bytes,temporary_bytes) values(?,?,?)",
        args: ["storage-org-a", 100, 40],
      })

      await expect(client.execute(sql)).rejects.toThrow(/check constraint/i)
    })
  })

  it("runごとの画像snapshotを4件までに制限する", async () => {
    await withStorageFixture(async (client, now) => {
      const assets = [
        { id: "count-1", sizeBytes: 1 },
        { id: "count-2", sizeBytes: 1 },
        { id: "count-3", sizeBytes: 1 },
        { id: "count-4", sizeBytes: 1 },
        { id: "count-5", sizeBytes: 1 },
      ]
      await client.batch(
        assets.flatMap(({ id, sizeBytes }) => [
          storageObjectStatement({ id, now, sizeBytes }),
          agentAssetStatement({ id, now }),
        ])
      )
      await client.batch(
        assets.slice(0, 4).map(({ id, sizeBytes }) => ({
          sql: "insert into agent_run_assets(organization_id,run_id,asset_id,storage_object_id,source_etag,size_bytes,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-org-a",
            "storage-run-count",
            id,
            id,
            `etag-${id}`,
            sizeBytes,
            now,
          ],
        }))
      )
      await expect(
        client.execute({
          sql: "insert into agent_run_assets(organization_id,run_id,asset_id,storage_object_id,source_etag,size_bytes,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-org-a",
            "storage-run-count",
            "count-5",
            "count-5",
            "etag-count-5",
            1,
            now,
          ],
        })
      ).rejects.toThrow(/agent_run_assets_count_limit/i)
    })
  })

  it("runごとの画像snapshotを20MiBまでに制限する", async () => {
    await withStorageFixture(async (client, now) => {
      const assets = [
        { id: "bytes-1", sizeBytes: 10_000_000 },
        { id: "bytes-2", sizeBytes: 10_000_000 },
        { id: "bytes-3", sizeBytes: 1 },
      ]
      await client.batch(
        assets.flatMap(({ id, sizeBytes }) => [
          storageObjectStatement({ id, now, sizeBytes }),
          agentAssetStatement({ id, now }),
        ])
      )
      await client.batch(
        assets.slice(0, 2).map(({ id, sizeBytes }) => ({
          sql: "insert into agent_run_assets(organization_id,run_id,asset_id,storage_object_id,source_etag,size_bytes,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-org-a",
            "storage-run-bytes",
            id,
            id,
            `etag-${id}`,
            sizeBytes,
            now,
          ],
        }))
      )
      await expect(
        client.execute({
          sql: "insert into agent_run_assets(organization_id,run_id,asset_id,storage_object_id,source_etag,size_bytes,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-org-a",
            "storage-run-bytes",
            "bytes-3",
            "bytes-3",
            "etag-bytes-3",
            1,
            now,
          ],
        })
      ).rejects.toThrow(/agent_run_assets_bytes_limit/i)
    })
  })

  it("物理object削除後もrun asset snapshotを保持する", async () => {
    await withStorageFixture(async (client, now) => {
      await client.batch([
        storageObjectStatement({ id: "snapshot-asset", now, sizeBytes: 1 }),
        agentAssetStatement({ id: "snapshot-asset", now }),
        {
          sql: "insert into agent_run_assets(organization_id,run_id,asset_id,storage_object_id,source_etag,size_bytes,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-org-a",
            "storage-run-bytes",
            "snapshot-asset",
            "snapshot-asset",
            "etag-snapshot-asset",
            1,
            now,
          ],
        },
      ])
      await client.execute(
        "update agent_assets set status = 'expired', storage_object_id = null where id = 'snapshot-asset'"
      )
      await client.execute(
        "update storage_objects set status = 'deleting',cleanup_revision = 1 where id = 'snapshot-asset'"
      )
      await client.execute(
        "update storage_objects set status = 'deleted',object_key = null where id = 'snapshot-asset'"
      )
      await client.execute(
        "delete from storage_objects where id = 'snapshot-asset'"
      )
      const retainedSnapshot = await client.execute(
        "select storage_object_id as storageObjectId,source_etag as sourceEtag from agent_run_assets where run_id = 'storage-run-bytes' and asset_id = 'snapshot-asset'"
      )
      expect(retainedSnapshot.rows).toMatchObject([
        { storageObjectId: null, sourceEtag: "etag-snapshot-asset" },
      ])
    })
  })
})

describe("storage cleanup jobの不変条件", () => {
  it.each([
    {
      label: "cleanup revisionが物理objectと一致しない",
      expectedCleanupRevision: 0,
      objectKey: cleanupObjectKey,
    },
    {
      label: "object keyが物理objectと一致しない",
      expectedCleanupRevision: 1,
      objectKey: "organizations/storage-org-a/storage-objects/wrong-key",
    },
  ])(
    "$label cleanup jobを拒否する",
    async ({ expectedCleanupRevision, objectKey }) => {
      await withStorageFixture(async (client, now) => {
        await insertDeletingCleanupObject(client, now)

        await expect(
          client.execute(
            storageCleanupJobStatement({
              id: "invalid-cleanup-job",
              expectedCleanupRevision,
              objectKey,
            })
          )
        ).rejects.toThrow(/storage_object_cleanup_job_fence_mismatch/i)
      })
    }
  )

  it("同じ物理objectとrevisionのcleanup jobを重複作成できない", async () => {
    await withStorageFixture(async (client, now) => {
      await insertDeletingCleanupObject(client, now)
      await client.execute(storageCleanupJobStatement({ id: "cleanup-job" }))

      await expect(
        client.execute(
          storageCleanupJobStatement({ id: "duplicate-cleanup-job" })
        )
      ).rejects.toThrow(/unique/i)
    })
  })

  it("cleanup jobのexpected revisionを変更できない", async () => {
    await withStorageFixture(async (client, now) => {
      await insertDeletingCleanupObject(client, now)
      await client.execute(storageCleanupJobStatement({ id: "cleanup-job" }))

      await expect(
        client.execute(
          "update storage_object_cleanup_jobs set expected_cleanup_revision = 2 where id = 'cleanup-job'"
        )
      ).rejects.toThrow(/storage_object_cleanup_job_fence_immutable/i)
    })
  })

  it("lease情報なしでcleanup jobをprocessingへ変更できない", async () => {
    await withStorageFixture(async (client, now) => {
      await insertDeletingCleanupObject(client, now)
      await client.execute(storageCleanupJobStatement({ id: "cleanup-job" }))

      await expect(
        client.execute(
          "update storage_object_cleanup_jobs set status = 'processing' where id = 'cleanup-job'"
        )
      ).rejects.toThrow(/check constraint/i)
    })
  })

  it("completed_atなしでcleanup jobをcompletedへ変更できない", async () => {
    await withStorageFixture(async (client, now) => {
      await insertDeletingCleanupObject(client, now)
      await client.execute(storageCleanupJobStatement({ id: "cleanup-job" }))
      await client.execute({
        sql: "update storage_object_cleanup_jobs set status = 'processing',lease_token = ?,locked_at = ?,lease_expires_at = ? where id = ?",
        args: ["a".repeat(64), now, now + 60_000, "cleanup-job"],
      })

      await expect(
        client.execute(
          "update storage_object_cleanup_jobs set status = 'completed',lease_token = null,locked_at = null,lease_expires_at = null where id = 'cleanup-job'"
        )
      ).rejects.toThrow(/check constraint/i)
    })
  })

  it("tenant metadata削除後も完了したcleanup jobを保持する", async () => {
    await withStorageFixture(async (client, now) => {
      await insertDeletingCleanupObject(client, now)
      await client.execute(storageCleanupJobStatement({ id: "cleanup-job" }))
      await client.execute({
        sql: "update storage_object_cleanup_jobs set status = 'processing',lease_token = ?,locked_at = ?,lease_expires_at = ? where id = ?",
        args: ["a".repeat(64), now, now + 60_000, "cleanup-job"],
      })
      await client.execute({
        sql: "update storage_object_cleanup_jobs set status = 'completed',lease_token = null,locked_at = null,lease_expires_at = null,completed_at = ? where id = ?",
        args: [now + 1, "cleanup-job"],
      })
      await client.execute(
        "update storage_objects set status = 'deleted',object_key = null where id = 'cleanup-object'"
      )

      await client.execute(
        "delete from organization where id = 'storage-org-a'"
      )

      const jobs = await client.execute(
        "select storage_object_id as storageObjectId,expected_cleanup_revision as expectedCleanupRevision,object_key as objectKey,status from storage_object_cleanup_jobs"
      )
      expect(jobs.rows).toMatchObject([
        {
          storageObjectId: "cleanup-object",
          expectedCleanupRevision: 1,
          objectKey: cleanupObjectKey,
          status: "completed",
        },
      ])
    })
  })
})
