import { auditLogs } from "@enterprise-agentic-saas/db/schema"
import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createSeededDb } from "../../app.test-support"
import { listAuditEvents } from "./repository"

describe("監査ログリポジトリ", () => {
  it("複数organizationの既知値が存在すると所属organizationだけを新しい順で返す", async () => {
    // Given: file操作とprofile image操作を含む複数organizationの監査ログが存在する
    const db = await createSeededDb()
    await db.insert(auditLogs).values([
      {
        id: "audit-file-uploaded",
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "file.uploaded",
        targetType: "file",
        targetId: "file-1",
        metadata: {},
        createdAt: new Date("2026-08-23T00:04:00.000Z"),
      },
      {
        id: "audit-file-deleted",
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "file.deleted",
        targetType: "file",
        targetId: "file-1",
        metadata: {},
        createdAt: new Date("2026-08-23T00:03:00.000Z"),
      },
      {
        id: "audit-profile-updated",
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "organization.profile_image.updated",
        targetType: "organization",
        targetId: "org_1",
        metadata: {},
        createdAt: new Date("2026-08-23T00:02:00.000Z"),
      },
      {
        id: "audit-profile-deleted",
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "organization.profile_image.deleted",
        targetType: "organization",
        targetId: "org_1",
        metadata: {},
        createdAt: new Date("2026-08-23T00:01:00.000Z"),
      },
      {
        id: "audit-other-organization",
        organizationId: "org_2",
        actorUserId: "user_2",
        action: "file.uploaded",
        targetType: "file",
        targetId: "private-file",
        metadata: {},
        createdAt: new Date("2026-08-23T00:05:00.000Z"),
      },
    ])

    // When: org_1の監査ログを要求する
    const events = await listAuditEvents(db, {
      organizationId: "org_1",
      limit: 100,
    })

    // Then: org_1の既知値だけを保存値のまま新しい順で返す
    expect(events.map(({ action }) => action)).toEqual([
      "file.uploaded",
      "file.deleted",
      "organization.profile_image.updated",
      "organization.profile_image.deleted",
    ])
    expect(events.map(({ targetType }) => targetType)).toEqual([
      "file",
      "file",
      "organization",
      "organization",
    ])
    expect(events.map(({ createdAt }) => createdAt)).toEqual([
      "2026-08-23T00:04:00.000Z",
      "2026-08-23T00:03:00.000Z",
      "2026-08-23T00:02:00.000Z",
      "2026-08-23T00:01:00.000Z",
    ])
    expect(JSON.stringify(events)).not.toContain("private-file")
  })

  it("既知のactionを指定すると一致する監査ログだけを返す", async () => {
    // Given: 同じorganizationに異なる既知actionの監査ログが存在する
    const db = await createSeededDb()
    await db.insert(auditLogs).values([
      {
        id: "audit-filter-uploaded",
        organizationId: "org_1",
        action: "file.uploaded",
        targetType: "file",
        metadata: {},
      },
      {
        id: "audit-filter-deleted",
        organizationId: "org_1",
        action: "file.deleted",
        targetType: "file",
        metadata: {},
      },
    ])

    // When: file.deletedで監査ログを絞り込む
    const events = await listAuditEvents(db, {
      organizationId: "org_1",
      action: "file.deleted",
      limit: 100,
    })

    // Then: 指定したactionの監査ログだけを返す
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      id: "audit-filter-deleted",
      action: "file.deleted",
      targetType: "file",
    })
  })

  it.each([
    {
      label: "未知のaction",
      action: "private.sentinel.action",
      targetType: "organization",
    },
    {
      label: "未知の対象種別",
      action: "organization.updated",
      targetType: "private_sentinel_target",
    },
  ])(
    "$labelを持つraw rowは失敗時に拒否する",
    async ({ action, targetType }) => {
      // Given: 正本にないdiscriminatorを持つraw監査ログが存在する
      const db = await createSeededDb()
      await db.run(sql`
      insert into audit_logs (
        id,
        organization_id,
        action,
        target_type,
        metadata,
        created_at
      ) values (
        'audit-unknown',
        'org_1',
        ${action},
        ${targetType},
        '{}',
        ${new Date("2026-08-23T00:00:00.000Z").getTime()}
      )
    `)

      // When: raw監査ログを公開形へprojectする
      const result = listAuditEvents(db, {
        organizationId: "org_1",
        limit: 100,
      })

      // Then: 未知値を受理せず固定された内部errorで拒否する
      await expect(result).rejects.toThrow("Invalid audit log discriminator")
    }
  )
})
