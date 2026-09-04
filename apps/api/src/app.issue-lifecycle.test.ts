import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"

const createThumbnailFixture = async () => {
  const db = await createSeededDb()
  const app = createApp(db)
  const oldest = new Date("2026-07-20T00:00:00.000Z")
  const newer = new Date("2026-07-21T00:00:00.000Z")
  await db.insert(schema.issues).values({
    id: "thumbnail-other-issue",
    organizationId: "org_1",
    number: 2,
    title: "Other thumbnail owner",
    creatorId: "user_1",
    createdAt: oldest,
    updatedAt: oldest,
  })
  await db.insert(schema.files).values([
    {
      id: "thumbnail-oldest",
      organizationId: "org_1",
      uploaderId: "user_1",
      uploadId: "thumbnail-upload-oldest",
      ownerType: "issue",
      objectKey: "thumbnail/object-oldest",
      filename: "oldest.png",
      sizeBytes: 100,
      declaredContentType: "image/png",
      detectedImageFormat: "png",
      imageWidth: 640,
      imageHeight: 480,
      etag: "etag-oldest",
      status: "ready",
      createdAt: oldest,
      updatedAt: oldest,
    },
    {
      id: "thumbnail-newer",
      organizationId: "org_1",
      uploaderId: "user_1",
      uploadId: "thumbnail-upload-newer",
      ownerType: "issue",
      objectKey: "thumbnail/object-newer",
      filename: "newer.jpg",
      sizeBytes: 120,
      declaredContentType: "image/jpeg",
      detectedImageFormat: "jpeg",
      imageWidth: 800,
      imageHeight: 800,
      etag: "etag-newer",
      status: "ready",
      createdAt: newer,
      updatedAt: newer,
    },
    {
      id: "thumbnail-avif",
      organizationId: "org_1",
      uploaderId: "user_1",
      uploadId: "thumbnail-upload-avif",
      ownerType: "issue",
      objectKey: "thumbnail/object-avif",
      filename: "unsupported.avif",
      sizeBytes: 80,
      declaredContentType: "image/avif",
      detectedImageFormat: "avif",
      imageWidth: 320,
      imageHeight: 320,
      etag: "etag-avif",
      status: "ready",
      createdAt: newer,
      updatedAt: newer,
    },
    {
      id: "thumbnail-other-owner",
      organizationId: "org_1",
      uploaderId: "user_1",
      uploadId: "thumbnail-upload-other",
      ownerType: "issue",
      objectKey: "thumbnail/object-other",
      filename: "other.png",
      sizeBytes: 90,
      declaredContentType: "image/png",
      detectedImageFormat: "png",
      imageWidth: 400,
      imageHeight: 400,
      etag: "etag-other",
      status: "ready",
      createdAt: newer,
      updatedAt: newer,
    },
  ])
  await db.insert(schema.issueFileOwners).values([
    {
      fileId: "thumbnail-oldest",
      organizationId: "org_1",
      issueId: "issue_1",
    },
    {
      fileId: "thumbnail-newer",
      organizationId: "org_1",
      issueId: "issue_1",
    },
    {
      fileId: "thumbnail-avif",
      organizationId: "org_1",
      issueId: "issue_1",
    },
    {
      fileId: "thumbnail-other-owner",
      organizationId: "org_1",
      issueId: "thumbnail-other-issue",
    },
  ])
  await db.insert(schema.issueComments).values([
    {
      id: "thumbnail-comment-1",
      organizationId: "org_1",
      issueId: "issue_1",
      authorId: "user_1",
      body: "First",
    },
    {
      id: "thumbnail-comment-2",
      organizationId: "org_1",
      issueId: "issue_1",
      authorId: "user_1",
      body: "Second",
    },
  ])
  return { app, db }
}

describe("Issue summaryとthumbnail", () => {
  it("Issue summaryへcomment数とattachment数と自動thumbnailを返す", async () => {
    const { app } = await createThumbnailFixture()
    const listResponse = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&sortBy=number&sortDirection=asc",
        { userId: "user_1" }
      )
    )

    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toMatchObject({
      items: [
        expect.objectContaining({
          id: "issue_1",
          attachmentCount: 3,
          commentCount: 2,
          thumbnail: expect.objectContaining({
            id: "thumbnail-oldest",
            filename: "oldest.png",
          }),
        }),
        expect.objectContaining({
          id: "thumbnail-other-issue",
          attachmentCount: 1,
          commentCount: 0,
        }),
      ],
    })
  })

  it("未選択のIssueへ最古の対応画像を自動thumbnailとして返す", async () => {
    const { app } = await createThumbnailFixture()
    const response = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail?organizationId=org_1", {
        userId: "user_1",
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      mode: "automatic",
      file: { id: "thumbnail-oldest" },
    })
  })

  it("thumbnail選択を1回だけrevisionと監査記録へ反映する", async () => {
    const { app, db } = await createThumbnailFixture()
    const selectThumbnail = () =>
      app.handle(
        jsonRequest("/issues/issue_1/thumbnail", {
          method: "PUT",
          userId: "user_1",
          body: { organizationId: "org_1", fileId: "thumbnail-newer" },
        })
      )

    const selected = await selectThumbnail()
    expect(selected.status).toBe(200)
    expect(await selected.json()).toMatchObject({
      mode: "selected",
      file: { id: "thumbnail-newer" },
    })
    await expect(selectThumbnail()).resolves.toMatchObject({ status: 200 })
    const [issue] = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(issue?.revision).toBe(2)
    const audits = await db
      .select()
      .from(schema.auditLogs)
      .where(
        sql`${schema.auditLogs.targetId} = 'issue_1' and ${schema.auditLogs.action} = 'issue.updated'`
      )
    expect(audits).toHaveLength(1)
  })

  it.each([
    {
      expectedStatus: 404,
      fileId: "thumbnail-other-owner",
      label: "別Issue所有file",
    },
    {
      expectedStatus: 400,
      fileId: "thumbnail-avif",
      label: "未対応画像形式",
    },
  ])(
    "$labelをthumbnailへ選択するrequestを拒否する",
    async ({ expectedStatus, fileId }) => {
      const { app } = await createThumbnailFixture()
      const response = await app.handle(
        jsonRequest("/issues/issue_1/thumbnail", {
          method: "PUT",
          userId: "user_1",
          body: { organizationId: "org_1", fileId },
        })
      )

      expect(response.status).toBe(expectedStatus)
    }
  )

  it("thumbnail選択を初期化して自動選択へ戻す", async () => {
    const { app, db } = await createThumbnailFixture()
    const selected = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: "thumbnail-newer" },
      })
    )
    if (selected.status !== 200) {
      throw new Error(
        `Thumbnail fixture selection failed with ${selected.status}`
      )
    }

    const reset = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: null },
      })
    )
    expect(reset.status).toBe(200)
    expect(await reset.json()).toMatchObject({
      mode: "automatic",
      file: { id: "thumbnail-oldest" },
    })
    const [issue] = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(issue?.revision).toBe(3)
  })
})

type CreatedLifecycleIssue = {
  dueDate: string
  id: string
  number: number
  title: string
}

const createLifecycleIssueFixture = async () => {
  const db = await createSeededDb()
  const app = createApp(db)
  const response = await app.handle(
    jsonRequest("/issues", {
      method: "POST",
      userId: "user_1",
      body: {
        organizationId: "org_1",
        title: " Login bug ",
        description: "OAuth callback fails",
        priority: "urgent",
        assigneeId: "user_4",
        labels: ["bug", "auth"],
        dueDate: "2026-08-15T10:30:00.000Z",
      },
    })
  )
  if (response.status !== 201) {
    throw new Error(`Issue fixture creation failed with ${response.status}`)
  }
  const created: CreatedLifecycleIssue = await response.json()
  return {
    app,
    created,
    db,
  }
}

const readAuditActions = async (
  app: ReturnType<typeof createApp>
): Promise<string[]> => {
  const response = await app.handle(
    jsonRequest("/organizations/org_1/audit-logs?limit=100", {
      userId: "user_3",
    })
  )
  const events: Array<{ action: string }> = await response.json()
  return events.map(({ action }) => action)
}

describe("Issue lifecycle操作", () => {
  it("Issue作成時に入力を正規化して日時とtimelineと監査記録を永続化する", async () => {
    const { app, created, db } = await createLifecycleIssueFixture()

    expect(created).toMatchObject({
      dueDate: "2026-08-15T10:30:00.000Z",
      number: 2,
      title: "Login bug",
    })
    const storedIssue = await db
      .select({ dueDate: schema.issues.dueDate })
      .from(schema.issues)
      .where(eq(schema.issues.id, created.id))
    expect(storedIssue[0]?.dueDate?.toISOString()).toBe(
      "2026-08-15T10:30:00.000Z"
    )
    const timeline = await app.handle(
      jsonRequest(`/issues/${created.id}/timeline?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect((await timeline.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "created", type: "activity" }),
      ])
    )
    await expect(readAuditActions(app)).resolves.toContain("issue.created")
  })

  it("Issue更新時にdetailとtimelineと監査記録を反映する", async () => {
    const { app, created } = await createLifecycleIssueFixture()
    const update = await app.handle(
      jsonRequest(`/issues/${created.id}`, {
        method: "PATCH",
        userId: "user_1",
        body: { organizationId: "org_1", status: "in_progress" },
      })
    )

    expect(await update.json()).toMatchObject({ status: "in_progress" })
    const detail = await app.handle(
      jsonRequest(`/issues/${created.id}?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(detail.status).toBe(200)
    expect((await detail.json()).dueDate).toBe("2026-08-15T10:30:00.000Z")
    const timeline = await app.handle(
      jsonRequest(`/issues/${created.id}/timeline?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect((await timeline.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "status",
          fromValue: "open",
          kind: "field_changed",
          toValue: "in_progress",
          type: "activity",
        }),
      ])
    )
    await expect(readAuditActions(app)).resolves.toContain("issue.updated")
  })

  it("Issue comment作成時にauthorとtimelineと監査記録を反映する", async () => {
    const { app, created } = await createLifecycleIssueFixture()
    const comment = await app.handle(
      jsonRequest(`/issues/${created.id}/comments`, {
        method: "POST",
        userId: "user_4",
        body: { organizationId: "org_1", body: "I can reproduce this." },
      })
    )

    expect(comment.status).toBe(201)
    expect(await comment.json()).toMatchObject({
      authorId: "user_4",
      author: { id: "user_4", name: "User 4", profileImage: null },
    })
    const timeline = await app.handle(
      jsonRequest(`/issues/${created.id}/timeline?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    const comments = (await timeline.json()).items.filter(
      (item: { type: string }) => item.type === "comment"
    )
    expect(comments).toEqual([
      expect.objectContaining({
        body: "I can reproduce this.",
        type: "comment",
      }),
    ])
    await expect(readAuditActions(app)).resolves.toContain(
      "issue.comment.created"
    )
  })

  it("organization内番号でIssueを取得する", async () => {
    const { app, created } = await createLifecycleIssueFixture()
    const response = await app.handle(
      jsonRequest(`/issues/by-number/${created.number}?organizationId=org_1`, {
        userId: "user_1",
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: created.id,
      number: created.number,
    })
  })
})
