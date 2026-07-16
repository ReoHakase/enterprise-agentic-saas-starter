import type { Db } from "@enterprise-agentic-saas/db"
import {
  invitation,
  invitationEmailJobs,
  organization,
  user,
} from "@enterprise-agentic-saas/db/schema"
import * as schema from "@enterprise-agentic-saas/db/schema"
import {
  EmailDeliveryError,
  type SendEmail,
} from "@enterprise-agentic-saas/email"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  processInvitationEmailJobs,
  type InvitationEmailJobFailure,
} from "./invitation-email-jobs"

const now = new Date("2026-07-15T00:00:00.000Z")

const createDatabase = async (): Promise<Db> => {
  const client = createClient({ url: "file::memory:?cache=shared" })
  await client.executeMultiple(`
    pragma foreign_keys = on;
    drop table if exists invitation_email_jobs;
    drop table if exists invitation;
    drop table if exists organization;
    drop table if exists user;
    create table user (
      id text primary key not null,
      name text not null,
      email text not null,
      email_verified integer not null,
      image text,
      created_at integer not null,
      updated_at integer not null
    );
    create table organization (
      id text primary key not null,
      name text not null,
      slug text not null,
      logo text,
      created_at integer not null,
      metadata text
    );
    create table invitation (
      id text primary key not null,
      organization_id text not null references organization(id) on delete cascade,
      email text not null,
      role text,
      status text not null default 'pending',
      expires_at integer not null,
      created_at integer not null,
      inviter_id text not null references user(id) on delete cascade
    );
    create table invitation_email_jobs (
      id text primary key not null,
      invitation_id text not null unique references invitation(id) on delete cascade,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null,
      completed_at integer
    );
  `)
  const database = drizzle(client, { schema })
  await database.insert(user).values({
    id: "user_1",
    name: "Inviter",
    email: "inviter@example.test",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await database.insert(organization).values({
    id: "org_1",
    name: "Organization",
    slug: "organization",
    createdAt: now,
  })
  return database
}

const insertDelivery = async (
  database: Db,
  input: {
    id: string
    email?: string
    expiresAt?: Date
    invitationStatus?: string
    jobStatus?: "canceled" | "failed" | "pending" | "processing"
    lockedAt?: Date | null
    attempts?: number
    nextAttemptAt?: Date | null
  }
) => {
  await database.insert(invitation).values({
    id: input.id,
    organizationId: "org_1",
    email: input.email ?? `${input.id}@example.test`,
    role: "member",
    status: input.invitationStatus ?? "pending",
    expiresAt: input.expiresAt ?? new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
    inviterId: "user_1",
  })
  await database.insert(invitationEmailJobs).values({
    id: `job_${input.id}`,
    invitationId: input.id,
    status: input.jobStatus ?? "pending",
    attempts: input.attempts ?? 0,
    lockedAt: input.lockedAt,
    nextAttemptAt: input.nextAttemptAt,
    createdAt: now,
  })
}

const rendered = {
  template: "organization_invitation" as const,
  subject: "Invitation",
  html: "<p>Invitation</p>",
  text: "Invitation",
  renderProps: {
    appName: "App",
    organizationName: "Organization",
    invitationUrl: "https://app.example.test/invitation",
  },
}

describe("invitation email jobs", () => {
  let database: Db
  let sendEmail: ReturnType<typeof vi.fn<SendEmail>>
  const renderEmail = vi.fn<() => Promise<typeof rendered>>(async () =>
    Promise.resolve(rendered)
  )

  beforeEach(async () => {
    database = await createDatabase()
    sendEmail = vi.fn<SendEmail>().mockResolvedValue(undefined)
    renderEmail.mockClear()
  })

  it("delivers a pending invitation and completes its fenced lease", async () => {
    await insertDelivery(database, { id: "invitation_1" })

    await expect(
      processInvitationEmailJobs({
        appBaseUrl: "https://app.example.test",
        appName: "App",
        database,
        now,
        renderEmail,
        sendEmail,
      })
    ).resolves.toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      canceled: 0,
      stale: 0,
    })

    expect(renderEmail).toHaveBeenCalledWith({
      appName: "App",
      invitationUrl: "https://app.example.test/invitations/invitation_1",
      inviterName: "Inviter",
      organizationName: "Organization",
    })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "invitation_1@example.test" })
    )
    expect(await database.select().from(invitationEmailJobs)).toMatchObject([
      {
        attempts: 1,
        completedAt: now,
        lastErrorCode: null,
        status: "completed",
      },
    ])
  })

  it("skips canceled and expired invitations without delivery", async () => {
    await insertDelivery(database, {
      id: "canceled",
      invitationStatus: "canceled",
    })
    await insertDelivery(database, {
      id: "expired",
      expiresAt: new Date(now.getTime() - 1),
    })

    await expect(
      processInvitationEmailJobs({ database, now, renderEmail, sendEmail })
    ).resolves.toEqual({
      claimed: 2,
      completed: 0,
      failed: 0,
      canceled: 2,
      stale: 0,
    })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(
      await database
        .select({ status: invitation.status })
        .from(invitation)
        .where(eq(invitation.id, "expired"))
    ).toEqual([{ status: "expired" }])
    expect(
      (await database.select().from(invitationEmailJobs)).map(
        ({ status }) => status
      )
    ).toEqual(["canceled", "canceled"])
  })

  it("stores only a normalized provider code and retry schedule", async () => {
    await insertDelivery(database, {
      id: "failure",
      email: "private-recipient@example.test",
    })
    sendEmail.mockRejectedValue({
      code: "unsafe provider code private-recipient@example.test",
      message: "raw provider response",
      retryable: true,
    })

    await expect(
      processInvitationEmailJobs({ database, now, renderEmail, sendEmail })
    ).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
      canceled: 0,
      stale: 0,
    })
    const [job] = await database.select().from(invitationEmailJobs)
    expect(job).toMatchObject({
      attempts: 1,
      lastErrorCode: "email_delivery_failed",
      nextAttemptAt: new Date(now.getTime() + 30_000),
      status: "failed",
    })
    expect(JSON.stringify(job)).not.toMatch(
      /private-recipient|raw provider response/
    )
  })

  it("preserves only trusted provider error codes", async () => {
    await insertDelivery(database, { id: "provider_failure" })
    sendEmail.mockRejectedValue(
      new EmailDeliveryError("E_RATE_LIMIT_EXCEEDED", true)
    )

    await expect(
      processInvitationEmailJobs({ database, now, renderEmail, sendEmail })
    ).resolves.toMatchObject({ claimed: 1, failed: 1 })
    expect(await database.select().from(invitationEmailJobs)).toMatchObject([
      {
        lastErrorCode: "E_RATE_LIMIT_EXCEEDED",
        nextAttemptAt: new Date(now.getTime() + 30_000),
        status: "failed",
      },
    ])
  })

  it("does not retry terminal provider failures or let observers change state", async () => {
    await insertDelivery(database, { id: "terminal_failure" })
    sendEmail.mockRejectedValue(
      new EmailDeliveryError("E_RECIPIENT_SUPPRESSED", false)
    )
    const onFailure = vi.fn<(failure: InvitationEmailJobFailure) => void>(
      () => {
        throw new Error("observer detail")
      }
    )

    await expect(
      processInvitationEmailJobs({
        database,
        now,
        onFailure,
        renderEmail,
        sendEmail,
      })
    ).resolves.toMatchObject({ claimed: 1, failed: 1 })
    expect(onFailure).toHaveBeenCalledWith({
      attempts: 1,
      errorCode: "E_RECIPIENT_SUPPRESSED",
      retryable: false,
    })
    expect(await database.select().from(invitationEmailJobs)).toMatchObject([
      {
        lastErrorCode: "E_RECIPIENT_SUPPRESSED",
        nextAttemptAt: null,
        status: "failed",
      },
    ])
    await expect(
      processInvitationEmailJobs({
        database,
        now: new Date(now.getTime() + 60 * 60 * 1000),
        renderEmail,
        sendEmail,
      })
    ).resolves.toMatchObject({ claimed: 0 })
  })

  it("terminally fails a missing delivery context instead of reclaiming forever", async () => {
    const client = createClient({ url: ":memory:" })
    await client.executeMultiple(`
      create table invitation_email_jobs (
        id text primary key not null,
        invitation_id text not null unique,
        status text not null default 'pending',
        attempts integer not null default 0,
        last_error_code text,
        locked_at integer,
        next_attempt_at integer,
        created_at integer not null,
        completed_at integer
      );
      create table invitation (id text primary key, organization_id text, email text, role text, status text, expires_at integer, created_at integer, inviter_id text);
      create table organization (id text primary key, name text, slug text, logo text, created_at integer, metadata text);
      create table user (id text primary key, name text, email text, email_verified integer, image text, created_at integer, updated_at integer);
      insert into invitation_email_jobs (id, invitation_id, status, attempts, created_at)
      values ('orphan_job', 'missing_invitation', 'pending', 0, ${now.getTime()});
    `)
    const orphanDatabase: Db = drizzle(client, { schema })

    await expect(
      processInvitationEmailJobs({
        database: orphanDatabase,
        now,
        renderEmail,
        sendEmail,
      })
    ).resolves.toMatchObject({ claimed: 1, failed: 1 })
    expect(
      await orphanDatabase.select().from(invitationEmailJobs)
    ).toMatchObject([
      {
        attempts: 1,
        lastErrorCode: "delivery_context_missing",
        nextAttemptAt: null,
        status: "failed",
      },
    ])
    await expect(
      processInvitationEmailJobs({
        database: orphanDatabase,
        now: new Date(now.getTime() + 60 * 60 * 1000),
        renderEmail,
        sendEmail,
      })
    ).resolves.toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      stale: 0,
    })
  })

  it("does not let an expired sender complete a newer lease", async () => {
    await insertDelivery(database, { id: "leased" })
    let resolveSend: (() => void) | undefined
    sendEmail.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSend = resolve
      })
    )

    const oldWorker = processInvitationEmailJobs({
      database,
      now,
      renderEmail,
      sendEmail,
    })
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce())
    const newerLease = new Date(now.getTime() + 5 * 60 * 1000 + 1)
    await database
      .update(invitationEmailJobs)
      .set({ attempts: 2, lockedAt: newerLease, status: "processing" })
    expect(resolveSend).toBeTypeOf("function")
    resolveSend?.()

    await expect(oldWorker).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 0,
      canceled: 0,
      stale: 1,
    })
    expect(await database.select().from(invitationEmailJobs)).toMatchObject([
      {
        attempts: 2,
        completedAt: null,
        lockedAt: newerLease,
        status: "processing",
      },
    ])
  })

  it("does not overwrite a cancellation committed while delivery is in flight", async () => {
    await insertDelivery(database, { id: "canceled_in_flight" })
    let resolveSend: (() => void) | undefined
    sendEmail.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSend = resolve
      })
    )

    const worker = processInvitationEmailJobs({
      database,
      now,
      renderEmail,
      sendEmail,
    })
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce())
    await database.transaction(async (tx) => {
      await tx
        .update(invitation)
        .set({ status: "canceled" })
        .where(eq(invitation.id, "canceled_in_flight"))
      await tx
        .update(invitationEmailJobs)
        .set({
          status: "canceled",
          completedAt: now,
          lockedAt: null,
          nextAttemptAt: null,
        })
        .where(eq(invitationEmailJobs.invitationId, "canceled_in_flight"))
    })
    resolveSend?.()

    await expect(worker).resolves.toMatchObject({ claimed: 1, stale: 1 })
    expect(await database.select().from(invitationEmailJobs)).toMatchObject([
      { completedAt: now, status: "canceled" },
    ])
  })
})
