import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { insertOrganizationWithSuperAdmin } from "../organizations/public"
import {
  createFixture,
  createRun,
  request,
} from "./action-repository.test-support"
import {
  issueAgentActionResumeTicket,
  resumeAgentApprovedAction,
} from "./actions/repository"

describe("Agent Issue organization context and resume tickets", () => {
  it("rotates the Agent context when creating and activating a replacement organization", async () => {
    const { db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "create-replacement-organization",
    })
    const [contextBefore] = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "action-session-a"))

    const created = await insertOrganizationWithSuperAdmin(db, {
      activate: true,
      name: "Replacement Organization",
      sessionId: "action-session-a",
      slug: `replacement-${crypto.randomUUID()}`,
      userId: "action-user-a",
    })

    const [currentSession] = await db
      .select({
        activeOrganizationId: schema.session.activeOrganizationId,
      })
      .from(schema.session)
      .where(eq(schema.session.id, "action-session-a"))
    const [contextAfter] = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "action-session-a"))
    expect(currentSession?.activeOrganizationId).toBe(created.id)
    expect(contextAfter?.contextEpoch).toBe(
      (contextBefore?.contextEpoch ?? 0) + 1
    )
    await expect(
      internal.readActiveOrganization({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("expires a resume ticket atomically and permits only one parallel consumer", async () => {
    const { app, db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "resume-race",
    })
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-resume-race",
      idempotencyKey: "prepare-resume-race",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        status: "in_progress",
      },
    })
    await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: {
          decision: "yes",
          idempotencyKey: "decision-resume-race",
        },
      })
    )
    const issuedAt = new Date()
    const expired = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
      now: issuedAt,
    })
    await expect(
      resumeAgentApprovedAction(db, {
        actionId: prepared.id,
        resumeTicket: expired.ticket,
        now: new Date(issuedAt.getTime() + 60_001),
      })
    ).rejects.toMatchObject({ code: "unauthorized" })

    const fresh = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
    })
    const results = await Promise.allSettled([
      resumeAgentApprovedAction(db, {
        actionId: prepared.id,
        resumeTicket: fresh.ticket,
      }),
      resumeAgentApprovedAction(db, {
        actionId: prepared.id,
        resumeTicket: fresh.ticket,
      }),
    ])
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    )
  })
})
