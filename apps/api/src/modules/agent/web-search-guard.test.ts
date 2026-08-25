import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createFixture } from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  prepareAgentChatForSession,
} from "./threads/repository"

const createGuard = async (
  queryLine = "Public-only Web query: Cloudflare R2 current limits"
) => {
  const { db } = await createFixture()
  const thread = await createAgentThreadForSession(db, {
    sessionId: "agent-session-a",
    title: "Guard thread",
    userId: "agent-user-a",
  })
  const prepared = await prepareAgentChatForSession(db, {
    assetIds: [],
    contentSegments: [{ text: queryLine, type: "text" }],
    messageId: "message_guard",
    sessionId: "agent-session-a",
    threadId: thread.id,
    timezone: "Asia/Tokyo",
    userId: "agent-user-a",
  })
  const internal = createAgentInternalApi(db)
  const chatRun = await internal.startChatRun({
    assetIds: [],
    clientMessageId: prepared.clientMessageId,
    estimatedInputTokenCount: 10,
    threadId: thread.id,
    ticket: prepared.ticket,
    trigger: "user_message",
  })
  return {
    authorize: internal.authorizeWebSearch,
    db,
    grant: chatRun.run.grant,
    thread,
  }
}

describe("Agent Web検索のserver guard", () => {
  it.each([
    {
      label: "英語のattestation",
      line: "Public-only Web query: Cloudflare R2 current limits",
      query: "Cloudflare R2 current limits",
    },
    {
      label: "日本語のattestation",
      line: "公開情報だけのWeb検索：Cloudflare R2 current limits",
      query: "Cloudflare R2 current limits",
    },
  ])("$labelで正確なqueryを受理する", async ({ line, query }) => {
    const { authorize, grant } = await createGuard(line)
    const input = { grant, operationId: "web_exact_query", query }
    await expect(authorize(input)).resolves.toEqual({
      query,
      reserved: true,
      reused: false,
    })
    await expect(authorize(input)).resolves.toEqual({
      query,
      reserved: true,
      reused: true,
    })
  })

  it.each([
    {
      label: "NUL文字を含むquery",
      query: "Cloudflare R2\u0000 current limits",
    },
    {
      label: "bidi format文字を含むquery",
      query: "organization_id: org_\u2066privatevalue\u2069",
    },
  ] as const)("$labelをquota予約前に拒否する", async ({ query }) => {
    const { authorize, db, grant } = await createGuard()

    await expect(
      authorize({ grant, operationId: "rejected_static_query", query })
    ).rejects.toMatchObject({ code: "validation_error" })
    const reservations = await db
      .select({ id: schema.agentResourceUsageBuckets.id })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "web_search"))
    expect(reservations).toEqual([])
  })

  it.each([
    { label: "organization名", query: "Agent Org A current limits" },
    { label: "Issueのtitle", query: "Fix API boundary current limits" },
    { label: "user名", query: "Agent User A public profile" },
  ] as const)("DB由来の$labelをquota予約前に拒否する", async ({ query }) => {
    const { authorize, db, grant } = await createGuard()

    await expect(
      authorize({ grant, operationId: "rejected_private_query", query })
    ).rejects.toMatchObject({ code: "validation_error" })
    const reservations = await db
      .select({ id: schema.agentResourceUsageBuckets.id })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "web_search"))
    expect(reservations).toEqual([])
  })

  it("authorizationを正確なtenant thread messageへbindingする", async () => {
    const first = await createGuard(
      "Public-only Web query: Cloudflare R2 current limits"
    )
    const secondThread = await createAgentThreadForSession(first.db, {
      sessionId: "agent-session-a",
      title: "Other guard thread",
      userId: "agent-user-a",
    })
    const secondPrepared = await prepareAgentChatForSession(first.db, {
      assetIds: [],
      contentSegments: [
        {
          text: "Public-only Web query: Bun runtime current limits",
          type: "text",
        },
      ],
      messageId: "message_other_guard",
      sessionId: "agent-session-a",
      threadId: secondThread.id,
      timezone: "Asia/Tokyo",
      userId: "agent-user-a",
    })
    expect(secondPrepared.clientMessageId).toBe("message_other_guard")

    await expect(
      first.authorize({
        grant: first.grant,
        operationId: "wrong_thread_web",
        query: "Bun runtime current limits",
      })
    ).rejects.toMatchObject({
      code: "validation_error",
    })
  })

  it("public限定lineのattestがない偽造旧digestを拒否する", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Forged guard thread",
      userId: "agent-user-a",
    })
    const prepared = await prepareAgentChatForSession(db, {
      assetIds: [],
      contentSegments: [{ text: "Summarize the current issue", type: "text" }],
      messageId:
        "message_forged_q_269294520791217599232f5d56c3e8ee7f5c79b50134cf82",
      sessionId: "agent-session-a",
      threadId: thread.id,
      timezone: "Asia/Tokyo",
      userId: "agent-user-a",
    })
    const internal = createAgentInternalApi(db)
    const chatRun = await internal.startChatRun({
      assetIds: [],
      clientMessageId: prepared.clientMessageId,
      estimatedInputTokenCount: 10,
      threadId: thread.id,
      ticket: prepared.ticket,
      trigger: "user_message",
    })

    await expect(
      internal.authorizeWebSearch({
        grant: chatRun.run.grant,
        operationId: "forged_digest_web",
        query: "Cloudflare R2 current limits",
      })
    ).rejects.toMatchObject({
      code: "validation_error",
    })
  })

  it("tenant Issue contextが上限を超えた場合はfail closedにする", async () => {
    const { authorize, db, grant } = await createGuard()
    const now = new Date()
    await db.insert(schema.issues).values(
      Array.from({ length: 200 }, (_, index) => ({
        createdAt: now,
        creatorId: "agent-user-a",
        description: "Private issue context",
        id: `guard-boundary-${index}`,
        labels: [],
        number: index + 2,
        organizationId: "agent-org-a",
        priority: "no_priority" as const,
        status: "open" as const,
        title: `Private issue ${index}`,
        updatedAt: now,
      }))
    )
    await expect(
      authorize({
        grant,
        operationId: "oversized_context_web",
        query: "Cloudflare R2 current limits",
      })
    ).rejects.toMatchObject({
      code: "validation_error",
    })
  })
})
