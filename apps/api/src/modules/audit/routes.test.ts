import { auditLogs } from "@enterprise-agentic-saas/db/schema"
import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createApp } from "../../app"
import { createSeededDb, jsonRequest } from "../../app.test-support"

describe("監査ログroute", () => {
  it("ownerとadminが既知のfileとprofile image監査ログを取得できる", async () => {
    // Given: 所属organizationにfileとprofile imageの監査ログが存在する
    const db = await createSeededDb()
    await db.insert(auditLogs).values([
      {
        id: "audit-route-file",
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "file.uploaded",
        targetType: "file",
        targetId: "file-1",
        metadata: {},
        createdAt: new Date("2026-08-23T00:02:00.000Z"),
      },
      {
        id: "audit-route-profile",
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "organization.profile_image.updated",
        targetType: "organization",
        targetId: "org_1",
        metadata: {},
        createdAt: new Date("2026-08-23T00:01:00.000Z"),
      },
    ])
    const app = createApp(db)

    // When: ownerがfile actionで絞り込み、adminが一覧を要求する
    const [ownerResponse, adminResponse] = await Promise.all([
      app.handle(
        jsonRequest("/organizations/org_1/audit-logs?action=file.uploaded", {
          userId: "user_1",
        })
      ),
      app.handle(
        jsonRequest("/organizations/org_1/audit-logs", {
          userId: "user_3",
        })
      ),
    ])

    // Then: 両roleへ既知値を保存値のまま返す
    expect(ownerResponse.status).toBe(200)
    expect(await ownerResponse.json()).toMatchObject([
      { action: "file.uploaded", targetType: "file" },
    ])
    expect(adminResponse.status).toBe(200)
    expect(await adminResponse.json()).toMatchObject([
      { action: "file.uploaded", targetType: "file" },
      {
        action: "organization.profile_image.updated",
        targetType: "organization",
      },
    ])
  })

  it("memberまたはactive organization不一致の利用者を拒否する", async () => {
    // Given: memberと複数organizationに所属する利用者が存在する
    const app = createApp(await createSeededDb())

    // When: memberが監査ログを要求し、別の利用者がinactive organizationを要求する
    const [memberResponse, mismatchResponse] = await Promise.all([
      app.handle(
        jsonRequest("/organizations/org_1/audit-logs", {
          userId: "user_4",
        })
      ),
      app.handle(
        jsonRequest("/organizations/org_2/audit-logs", {
          userId: "user_5",
          activeOrganizationId: "org_1",
        })
      ),
    ])

    // Then: 既存のauthorization contractに従って拒否する
    expect(memberResponse.status).toBe(403)
    expect(await memberResponse.json()).toMatchObject({ error: "forbidden" })
    expect(mismatchResponse.status).toBe(409)
    expect(await mismatchResponse.json()).toMatchObject({
      error: "active_organization_mismatch",
    })
  })

  it("未知のdiscriminatorを固定されたpublic errorで拒否する", async () => {
    // Given: 未知のactionを持つraw監査ログが存在する
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
        'audit-route-unknown',
        'org_1',
        'private.sentinel.action',
        'organization',
        '{}',
        ${new Date("2026-08-23T00:00:00.000Z").getTime()}
      )
    `)
    const app = createApp(db)

    // When: adminが監査ログを要求する
    const response = await app.handle(
      jsonRequest("/organizations/org_1/audit-logs", {
        userId: "user_3",
      })
    )
    const body = await response.json()

    // Then: 未知値を露出せず固定されたerrorを返す
    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: "internal_error",
      message: "An unexpected error occurred.",
    })
    expect(JSON.stringify(body)).not.toContain("private.sentinel")
  })
})
