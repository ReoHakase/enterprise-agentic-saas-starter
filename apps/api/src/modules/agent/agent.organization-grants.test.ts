import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
  transferOwnershipById,
  updateMemberRoleById,
} from "../organizations/public"
import { createFixture, request } from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

type AgentTestDb = Awaited<ReturnType<typeof createFixture>>["db"]

const attachmentCreatedAt = new Date("2026-07-23T00:00:00.000Z")

const seedIssueAttachmentProjection = async (db: AgentTestDb) => {
  await db.insert(schema.files).values([
    {
      id: "agent-file-image",
      organizationId: "agent-org-a",
      uploaderId: "agent-user-a",
      uploadId: "agent-upload-image",
      ownerType: "issue",
      objectKey: "private/agent-file-image",
      filename: "marker.jpeg",
      sizeBytes: 1_024,
      declaredContentType: "image/jpeg",
      detectedImageFormat: "jpeg",
      imageWidth: 640,
      imageHeight: 480,
      etag: "agent-file-image-etag",
      status: "ready",
      createdAt: attachmentCreatedAt,
      updatedAt: attachmentCreatedAt,
    },
    {
      id: "agent-file-pdf",
      organizationId: "agent-org-a",
      uploaderId: "agent-user-b",
      uploadId: "agent-upload-pdf",
      ownerType: "issue",
      objectKey: "private/agent-file-pdf",
      filename: "notes.pdf",
      sizeBytes: 2_048,
      declaredContentType: "application/pdf",
      detectedImageFormat: null,
      etag: "agent-file-pdf-etag",
      status: "ready",
      createdAt: new Date(attachmentCreatedAt.getTime() - 1_000),
      updatedAt: attachmentCreatedAt,
    },
    {
      id: "agent-file-pending",
      organizationId: "agent-org-a",
      uploaderId: "agent-user-a",
      uploadId: "agent-upload-pending",
      ownerType: "issue",
      objectKey: "private/agent-file-pending",
      filename: "pending.png",
      sizeBytes: 512,
      declaredContentType: "image/png",
      detectedImageFormat: "png",
      status: "pending",
      createdAt: new Date(attachmentCreatedAt.getTime() + 1_000),
      updatedAt: attachmentCreatedAt,
    },
  ])
  await db.insert(schema.issueFileOwners).values([
    {
      fileId: "agent-file-image",
      organizationId: "agent-org-a",
      ownerType: "issue",
      issueId: "agent-issue-a",
    },
    {
      fileId: "agent-file-pdf",
      organizationId: "agent-org-a",
      ownerType: "issue",
      issueId: "agent-issue-a",
    },
    {
      fileId: "agent-file-pending",
      organizationId: "agent-org-a",
      ownerType: "issue",
      issueId: "agent-issue-a",
    },
  ])
}

const createReadRunFixture = async () => {
  const { db } = await createFixture()
  const thread = await createAgentThreadForSession(db, {
    sessionId: "agent-session-a",
    userId: "agent-user-a",
    title: "Read tools",
  })
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId: "agent-session-a",
    userId: "agent-user-a",
    threadId: thread.id,
  })
  const internal = createAgentInternalApi(db)
  const { run } = await internal.startChatRun({
    clientMessageId: "message-read-tools",
    ticket: ticket.ticket,
    threadId: thread.id,
  })
  return { db, internal, run }
}

describe("Agent organization projectionとgrant失効", () => {
  it("allowlist対象のaccountとorganizationとmemberとlabelとIssue一覧だけを返す", async () => {
    const { internal, run } = await createReadRunFixture()
    const [account, activeOrganization, members, labels, issues] =
      await Promise.all([
        internal.readAccountContext({ grant: run.grant }),
        internal.readActiveOrganization({ grant: run.grant }),
        internal.searchOrganizationMembers({
          grant: run.grant,
          query: "Agent",
        }),
        internal.searchIssueLabels({ grant: run.grant, query: "back" }),
        internal.searchIssues({ grant: run.grant, search: "boundary" }),
      ])

    expect(account).toEqual({
      name: "Agent User A",
      profileImage: null,
    })
    expect(account).not.toHaveProperty("email")
    expect(activeOrganization).toMatchObject({
      slug: "agent-org-a",
      role: "owner",
      permissions: { canDeleteAnyIssue: true },
    })
    expect(members).toHaveLength(2)
    expect(members[0]).not.toHaveProperty("email")
    expect(labels).toEqual([{ label: "Backend", usageCount: 1 }])
    expect(issues).toHaveLength(1)
    expect(issues[0]).not.toHaveProperty("organizationId")
    expect(issues[0]).not.toHaveProperty("creatorId")
  })

  it("Issue attachmentをpaginationしてprivate storage fieldを隠す", async () => {
    const { db, internal, run } = await createReadRunFixture()
    await seedIssueAttachmentProjection(db)

    const issue = await internal.getIssue({
      attachmentLimit: 1,
      grant: run.grant,
      lookup: "number",
      number: 1,
    })
    expect(issue).toMatchObject({ id: "agent-issue-a", number: 1 })
    expect(issue).not.toHaveProperty("organizationId")
    expect(issue.attachments.items).toEqual([
      {
        id: "agent-file-image",
        filename: "marker.jpeg",
        sizeBytes: 1_024,
        declaredContentType: "image/jpeg",
        imageReadable: true,
        textPreviewable: false,
        dimensions: { width: 640, height: 480 },
        uploaderName: "Agent User A",
        createdAt: attachmentCreatedAt.toISOString(),
      },
    ])
    expect(issue.attachments.nextCursor).toEqual(expect.any(String))
    expect(JSON.stringify(issue.attachments)).not.toContain("objectKey")
    expect(JSON.stringify(issue.attachments)).not.toContain("etag")

    const secondAttachmentPage = await internal.getIssue({
      attachmentCursor: issue.attachments.nextCursor ?? undefined,
      attachmentLimit: 1,
      grant: run.grant,
      lookup: "id",
      id: issue.id,
    })
    expect(secondAttachmentPage.attachments).toMatchObject({
      items: [
        {
          id: "agent-file-pdf",
          imageReadable: false,
          textPreviewable: false,
          dimensions: null,
          uploaderName: "Agent User B",
        },
      ],
      nextCursor: null,
    })
    expect(
      secondAttachmentPage.attachments.items.some(
        (attachment) => attachment.id === "agent-file-pending"
      )
    ).toBe(false)
  })

  it("別テナントのIssueをnot foundで隠す", async () => {
    const { internal, run } = await createReadRunFixture()
    await expect(
      internal.getIssue({
        grant: run.grant,
        lookup: "id",
        id: "agent-issue-b",
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("完了したrunのgrantを再利用させない", async () => {
    const { internal, run } = await createReadRunFixture()
    await expect(
      internal.finalizeRun({ grant: run.grant, outcome: "completed" })
    ).resolves.toEqual({ runId: run.runId, status: "completed" })
    await expect(
      internal.readAccountContext({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("古いgrantを無効化してorganization切替transaction内で実行する", async () => {
    const { app, db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Switch organization",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const internal = createAgentInternalApi(db)
    const chatRun = await internal.startChatRun({
      clientMessageId: "message-before-switch",
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = chatRun.run

    const switched = await app.handle(
      request("/organizations/agent-org-b/activate", {
        method: "POST",
        body: {},
      })
    )
    expect(switched.status).toBe(200)
    expect(await switched.json()).toEqual({
      activeOrganizationId: "agent-org-b",
    })

    const contexts = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "agent-session-a"))
    expect(contexts).toEqual([{ contextEpoch: 2 }])
    const grants = await db
      .select({ revokedAt: schema.agentGrants.revokedAt })
      .from(schema.agentGrants)
      .where(eq(schema.agentGrants.sessionId, "agent-session-a"))
    expect(grants).not.toHaveLength(0)
    expect(grants.every(({ revokedAt }) => revokedAt instanceof Date)).toBe(
      true
    )
    const runs = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.sessionId, "agent-session-a"),
          eq(schema.agentRuns.id, run.runId)
        )
      )
    expect(runs).toEqual([{ status: "canceled" }])
    await expect(
      internal.readActiveOrganization({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })

    const repeated = await app.handle(
      request("/organizations/agent-org-b/activate", {
        method: "POST",
        body: {},
        activeOrganizationId: "agent-org-b",
      })
    )
    expect(repeated.status).toBe(200)
    const repeatedContext = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "agent-session-a"))
    expect(repeatedContext).toEqual([{ contextEpoch: 2 }])
  })

  it("対象userのrole変更時にactive contextを失効させる", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-b",
      userId: "agent-user-b",
      title: "Role change",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-b",
      userId: "agent-user-b",
      threadId: thread.id,
    })
    const internal = createAgentInternalApi(db)
    const chatRun = await internal.startChatRun({
      clientMessageId: "message-before-role-change",
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = chatRun.run

    await expect(
      updateMemberRoleById(db, {
        actorUserId: "agent-user-a",
        memberId: "agent-member-a-2",
        organizationId: "agent-org-a",
        previousRole: "member",
        role: "admin",
      })
    ).resolves.toMatchObject({ role: "admin" })

    const context = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "agent-session-b"))
    expect(context).toEqual([{ contextEpoch: 2 }])
    const storedRun = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.runId))
    expect(storedRun).toEqual([{ status: "canceled" }])
    await expect(
      internal.readActiveOrganization({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("ownerでないactorによるownership移譲を拒否する", async () => {
    const { db } = await createFixture()

    await expect(
      transferOwnershipById(db, {
        actorMemberId: "agent-member-a-1",
        actorUserId: "agent-user-b",
        organizationId: "agent-org-a",
        targetMemberId: "agent-member-a-2",
      })
    ).resolves.toBe("actor_not_owner")
  })

  it("ownership移譲時に昇格userと降格userの両方を失効させる", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApi(db)
    const createRun = async (input: {
      clientMessageId: string
      sessionId: string
      userId: string
    }) => {
      const thread = await createAgentThreadForSession(db, {
        sessionId: input.sessionId,
        userId: input.userId,
        title: `Transfer ${input.userId}`,
      })
      const ticket = await issueAgentConnectionTicket(db, {
        sessionId: input.sessionId,
        userId: input.userId,
        threadId: thread.id,
      })
      const chatRun = await internal.startChatRun({
        clientMessageId: input.clientMessageId,
        ticket: ticket.ticket,
        threadId: thread.id,
      })
      return chatRun.run
    }
    const actorRun = await createRun({
      clientMessageId: "message-transfer-actor",
      sessionId: "agent-session-a",
      userId: "agent-user-a",
    })
    const targetRun = await createRun({
      clientMessageId: "message-transfer-target",
      sessionId: "agent-session-b",
      userId: "agent-user-b",
    })

    await expect(
      transferOwnershipById(db, {
        actorMemberId: "agent-member-a-1",
        actorUserId: "agent-user-a",
        organizationId: "agent-org-a",
        targetMemberId: "agent-member-a-2",
      })
    ).resolves.toBe("transferred")

    const contexts = await db
      .select({
        contextEpoch: schema.agentSessionContexts.contextEpoch,
        sessionId: schema.agentSessionContexts.sessionId,
      })
      .from(schema.agentSessionContexts)
    expect(
      contexts
        .map(({ contextEpoch, sessionId }) => ({ contextEpoch, sessionId }))
        .toSorted((left, right) =>
          left.sessionId.localeCompare(right.sessionId)
        )
    ).toEqual([
      { contextEpoch: 2, sessionId: "agent-session-a" },
      { contextEpoch: 2, sessionId: "agent-session-b" },
    ])
    const runs = await db
      .select({ id: schema.agentRuns.id, status: schema.agentRuns.status })
      .from(schema.agentRuns)
    expect(runs).toEqual(
      expect.arrayContaining([
        { id: actorRun.runId, status: "canceled" },
        { id: targetRun.runId, status: "canceled" },
      ])
    )
    await expect(
      internal.readAccountContext({ grant: actorRun.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
    await expect(
      internal.readAccountContext({ grant: targetRun.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })
})
