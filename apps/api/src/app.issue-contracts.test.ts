import * as schema from "@enterprise-agentic-saas/db/schema"
import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
  SendEmail,
} from "@enterprise-agentic-saas/email"
import * as v from "valibot"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "./app"
import {
  authHeaders,
  createSeededDb,
  jsonRequest,
  startHttpServer,
  testDb,
} from "./app.test-support"
import { createApiClient } from "./client"
import { HttpError } from "./errors/http-error"
import { issueTimelinePageModel } from "./modules/issues/model"

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

describe("Issue transport, pagination, and tenant contracts", () => {
  it("paginates equal-timestamp timeline items without gaps or duplicates", async () => {
    const db = await createSeededDb()
    const createdAt = new Date("2026-07-17T03:00:00.000Z")
    await db.insert(schema.issueActivityEvents).values([
      {
        id: "activity-position-2",
        organizationId: "org_1",
        issueId: "issue_1",
        actorUserId: "user_1",
        batchId: "batch-equal-time",
        position: 2,
        kind: "field_changed",
        field: "priority",
        fromValue: "low",
        toValue: "high",
        createdAt,
      },
      {
        id: "activity-position-1",
        organizationId: "org_1",
        issueId: "issue_1",
        actorUserId: "user_1",
        batchId: "batch-equal-time",
        position: 1,
        kind: "field_changed",
        field: "status",
        fromValue: "open",
        toValue: "in_progress",
        createdAt,
      },
      {
        id: "shared-entry",
        organizationId: "org_1",
        issueId: "issue_1",
        actorUserId: "user_2",
        batchId: "batch-equal-time",
        position: 0,
        kind: "field_changed",
        field: "assignee",
        fromValue: null,
        toValue: "user_1",
        createdAt,
      },
    ])
    await db.insert(schema.issueComments).values([
      {
        id: "shared-entry",
        organizationId: "org_1",
        issueId: "issue_1",
        authorId: "user_1",
        body: "Same id as an activity",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "older-comment",
        organizationId: "org_1",
        issueId: "issue_1",
        authorId: "user_1",
        body: "Last in the total order",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    const app = createApp(db)
    const items: Array<{
      type: "activity" | "comment"
      id: string
      actor?: {
        id: string | null
        name: string
        profileImage: string | null
      }
    }> = []
    let cursor: string | null = null

    const loadPage = async (remainingPages: number): Promise<void> => {
      const query = new URLSearchParams({
        organizationId: "org_1",
        limit: "1",
      })
      if (cursor) query.set("cursor", cursor)
      const response = await app.handle(
        jsonRequest(`/issues/issue_1/timeline?${query}`, { userId: "user_1" })
      )
      expect(response.status).toBe(200)
      const page = v.parse(issueTimelinePageModel, await response.json())
      items.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) return
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(cursor).not.toContain(createdAt.toISOString())
      if (remainingPages <= 1) return
      await loadPage(remainingPages - 1)
    }
    await loadPage(6)

    expect(cursor).toBeNull()
    expect(items.map(({ id, type }) => `${type}:${id}`)).toEqual([
      "activity:activity-position-2",
      "activity:activity-position-1",
      "comment:shared-entry",
      "activity:shared-entry",
      "comment:older-comment",
    ])
    expect(new Set(items.map(({ id, type }) => `${type}:${id}`)).size).toBe(5)
    expect(
      items.find(
        (item) => item.type === "activity" && item.id === "shared-entry"
      )?.actor
    ).toEqual({ id: null, name: "Former member", profileImage: null })

    const malformed = await app.handle(
      jsonRequest(
        "/issues/issue_1/timeline?organizationId=org_1&cursor=not-a-cursor",
        { userId: "user_1" }
      )
    )
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({
      error: "validation_error",
    })
  })

  it("keeps non-null date-time fields as strings over the real Eden HTTP transport", async () => {
    const app = createApp(await createSeededDb())
    const server = await startHttpServer(app)

    try {
      const client = createApiClient(server.origin, {
        headers: authHeaders("user_1"),
      })
      const response = await client.issues.post({
        organizationId: "org_1",
        title: "Date contract",
        dueDate: "2026-09-30T18:45:00.000Z",
      })

      expect(response.status).toBe(201)
      expect(response.error).toBeNull()
      expect(response.data).toMatchObject({
        dueDate: "2026-09-30T18:45:00.000Z",
      })
      expect(response.data?.dueDate).toBeTypeOf("string")
      expect(response.data?.createdAt).toBeTypeOf("string")
      expect(response.data?.updatedAt).toBeTypeOf("string")
    } finally {
      await server.close()
    }
  })

  it("returns a fixed validation code without reflecting invalid input", async () => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest("/issues", {
        method: "POST",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          title: "",
          dueDate: "private-value-that-must-not-be-reflected",
        },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: "validation_error",
    })
    expect(JSON.stringify(body)).not.toContain(
      "private-value-that-must-not-be-reflected"
    )

    const serviceValidation = await app.handle(
      jsonRequest("/issues", {
        method: "POST",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          title: "Tenant-scoped assignee",
          assigneeId: "user_2",
        },
      })
    )
    expect(await serviceValidation.json()).toMatchObject({
      error: "validation_error",
    })
  })

  it("allocates unique organization-local numbers under concurrent creates", async () => {
    const app = createApp(await createSeededDb())
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        app.handle(
          jsonRequest("/issues", {
            method: "POST",
            userId: "user_1",
            body: { organizationId: "org_1", title: `Concurrent ${index}` },
          })
        )
      )
    )
    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 201, 201, 201,
    ])
    const numbers = await Promise.all(
      responses.map(async (response) => (await response.json()).number)
    )
    expect(new Set(numbers).size).toBe(5)
  })

  it("does not attach a comment through a different tenant context", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const response = await app.handle(
      jsonRequest("/issues/issue_1/comments", {
        method: "POST",
        userId: "user_5",
        activeOrganizationId: "org_2",
        body: { organizationId: "org_2", body: "cross tenant" },
      })
    )
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe("not_found")
    expect(await db.select().from(schema.issueComments)).toHaveLength(0)
  })

  it("does not expose an author profile outside the comment tenant", async () => {
    const db = await createSeededDb()
    await db.insert(schema.issueComments).values({
      id: "comment_cross_tenant_author",
      issueId: "issue_1",
      organizationId: "org_1",
      authorId: "user_2",
      body: "Historical comment",
    })
    const app = createApp(db)

    const response = await app.handle(
      jsonRequest("/issues/issue_1/comments?organizationId=org_1", {
        userId: "user_1",
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        authorId: "user_2",
        author: {
          id: "user_2",
          name: "Former member",
          profileImage: null,
        },
      }),
    ])
  })

  it("does not leak secret-looking unknown errors", async () => {
    const app = createApp(testDb()).get("/_test/boom", () => {
      throw new Error("TURSO_AUTH_TOKEN=super-secret-value")
    })
    const response = await app.handle(
      new Request("http://localhost/_test/boom", {
        headers: { "x-request-id": "req_test" },
      })
    )
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: "internal_error",
      message: "An unexpected error occurred.",
    })
    expect(response.headers.get("x-request-id")).toBe("req_test")
    expect(JSON.stringify(body)).not.toContain("super-secret-value")
  })

  it("keeps untrusted HttpError detail out of the HTTP response", async () => {
    const error = new HttpError({ code: "validation_error" })
    Object.defineProperty(error, "detail", {
      value: {
        action: "invitation.create",
        field: "email",
        organizationId: "org_private",
        reason: "token=super-secret-value",
        retryAfter: -1,
      },
    })
    error.message = "TURSO_AUTH_TOKEN=super-secret-message"
    const app = createApp(testDb()).get("/_test/public-error", () => {
      throw error
    })

    const response = await app.handle(
      new Request("http://localhost/_test/public-error")
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: "validation_error",
      message: "The request is invalid.",
    })
    expect(response.headers.get("x-request-id")).toBeTruthy()
    expect(JSON.stringify(body)).not.toMatch(
      /org_private|super-secret-message|super-secret-value|organizationId/
    )
  })
})
