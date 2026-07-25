import * as schema from "@enterprise-agentic-saas/db/schema"
import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
  SendEmail,
} from "@enterprise-agentic-saas/email"
import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"

const { invitationEmailRenderSpy, invitationEmailSendSpy } = vi.hoisted(() => ({
  invitationEmailRenderSpy: vi.fn<
    (
      props: OrganizationInvitationEmailProps
    ) => Promise<RenderedEmail<OrganizationInvitationEmailProps>>
  >(async (props) => ({
    template: "organization_invitation",
    subject: "Organization invitation",
    html: "<p>Organization invitation</p>",
    text: "Organization invitation",
    renderProps: props,
  })),
  invitationEmailSendSpy: vi.fn<SendEmail>(async () => undefined),
}))

vi.mock(import("@enterprise-agentic-saas/email"), async (importOriginal) => ({
  ...(await importOriginal()),
  renderOrganizationInvitationEmail: invitationEmailRenderSpy,
}))
vi.mock("@enterprise-agentic-saas/email/runtime", () => ({
  backgroundTaskHandler: undefined,
  createRuntimeEmailSender: () => invitationEmailSendSpy,
}))

beforeEach(() => {
  invitationEmailRenderSpy.mockClear()
  invitationEmailSendSpy.mockReset()
  invitationEmailSendSpy.mockResolvedValue(undefined)
})

describe("Issue queries, mutations, and profile images", () => {
  it("returns stable server-filtered Issue pages beyond the first ten rows", async () => {
    const db = await createSeededDb()
    const now = new Date("2026-07-22T00:00:00.000Z")
    await db.insert(schema.issues).values(
      Array.from({ length: 12 }, (_, index) => ({
        id: `paged-issue-${index + 2}`,
        organizationId: "org_1",
        number: index + 2,
        title: `Paged Issue ${index + 2}`,
        description: "server pagination fixture",
        status: "open" as const,
        priority: "medium" as const,
        creatorId: "user_1",
        labels: ["pagination"],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }))
    )
    const response = await createApp(db).handle(
      jsonRequest(
        "/issues?organizationId=org_1&sortBy=number&sortDirection=asc&page=2",
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      items: [
        expect.objectContaining({ number: 11 }),
        expect.objectContaining({ number: 12 }),
        expect.objectContaining({ number: 13 }),
      ],
      page: 2,
      pageSize: 10,
      total: 13,
    })
  })

  it("returns Issue summaries and selects or resets an authenticated thumbnail", async () => {
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

    const automatic = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail?organizationId=org_1", {
        userId: "user_1",
      })
    )
    expect(automatic.status).toBe(200)
    expect(await automatic.json()).toMatchObject({
      mode: "automatic",
      file: { id: "thumbnail-oldest" },
    })

    const select = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: "thumbnail-newer" },
      })
    )
    expect(select.status).toBe(200)
    expect(await select.json()).toMatchObject({
      mode: "selected",
      file: { id: "thumbnail-newer" },
    })

    const afterSelect = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(afterSelect[0]?.revision).toBe(2)
    const auditsAfterSelect = await db
      .select()
      .from(schema.auditLogs)
      .where(
        sql`${schema.auditLogs.targetId} = 'issue_1' and ${schema.auditLogs.action} = 'issue.updated'`
      )
    expect(auditsAfterSelect).toHaveLength(1)

    const noOp = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: "thumbnail-newer" },
      })
    )
    expect(noOp.status).toBe(200)
    const afterNoOp = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(afterNoOp[0]?.revision).toBe(2)

    const wrongOwner = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          fileId: "thumbnail-other-owner",
        },
      })
    )
    expect(wrongOwner.status).toBe(404)
    const unsupported = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: "thumbnail-avif" },
      })
    )
    expect(unsupported.status).toBe(400)

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
    const afterReset = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(afterReset[0]?.revision).toBe(3)
  })

  it("creates, filters, updates, loads, and comments on an issue", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const createResponse = await app.handle(
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
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      number: 2,
      title: "Login bug",
      dueDate: "2026-08-15T10:30:00.000Z",
    })
    expect(typeof created.dueDate).toBe("string")

    const storedIssue = await db
      .select({ dueDate: schema.issues.dueDate })
      .from(schema.issues)
      .where(eq(schema.issues.id, created.id))
    expect(storedIssue[0]?.dueDate?.toISOString()).toBe(
      "2026-08-15T10:30:00.000Z"
    )

    const filtered = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&search=OAuth&priority=urgent&label=auth&sortBy=number&sortDirection=asc",
        { userId: "user_1" }
      )
    )
    expect(await filtered.json()).toMatchObject({
      items: [expect.objectContaining({ id: created.id })],
      page: 1,
      pageSize: 10,
      total: 1,
    })

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

    const byNumber = await app.handle(
      jsonRequest(`/issues/by-number/${created.number}?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(byNumber.status).toBe(200)
    expect(await byNumber.json()).toMatchObject({ id: created.id, number: 2 })

    const timeline = await app.handle(
      jsonRequest(`/issues/${created.id}/timeline?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(timeline.status).toBe(200)
    const timelineBody = await timeline.json()
    expect(timelineBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "activity", kind: "created" }),
        expect.objectContaining({
          type: "activity",
          kind: "field_changed",
          field: "status",
          fromValue: "open",
          toValue: "in_progress",
        }),
        expect.objectContaining({
          type: "comment",
          body: "I can reproduce this.",
        }),
      ])
    )
    expect(
      timelineBody.items.filter(
        (item: { type: string }) => item.type === "comment"
      )
    ).toHaveLength(1)

    const audit = await app.handle(
      jsonRequest("/organizations/org_1/audit-logs?limit=100", {
        userId: "user_3",
      })
    )
    expect(
      (await audit.json()).map((event: { action: string }) => event.action)
    ).toEqual(
      expect.arrayContaining([
        "issue.created",
        "issue.updated",
        "issue.comment.created",
      ])
    )
  })
})
