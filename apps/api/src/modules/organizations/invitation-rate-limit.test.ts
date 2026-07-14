import type { Db } from "@enterprise-agentic-saas/db"
import { rateLimit } from "@enterprise-agentic-saas/db/schema"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { beforeEach, describe, expect, it } from "vitest"

import { AppError } from "../../errors/app-error"
import {
  invitationQuotaKey,
  reserveInvitationQuota,
} from "./invitation-rate-limit"

const now = new Date("2026-07-15T00:00:00.000Z")

const createDatabase = async (): Promise<Db> => {
  const client = createClient({ url: "file::memory:?cache=shared" })
  await client.executeMultiple(`
    drop table if exists rate_limit;
    create table rate_limit (
      id text primary key not null,
      key text not null unique,
      count integer not null,
      last_request integer not null
    );
  `)
  return drizzle(client, { schema })
}

describe("organization invitation quota", () => {
  let database: Db

  beforeEach(async () => {
    database = await createDatabase()
  })

  it("uses stable namespaced hashes without persisting identity values", async () => {
    const first = await invitationQuotaKey("actor_organization", [
      "user_private",
      "org_private",
    ])
    const second = await invitationQuotaKey("actor_organization", [
      "user_private",
      "org_private",
    ])
    const organization = await invitationQuotaKey("organization", [
      "org_private",
    ])

    expect(first).toBe(second)
    expect(first).not.toBe(organization)
    expect(first).toMatch(/^app:invitation:v1:actor_organization:[0-9a-f]{64}$/)
    expect(first).not.toMatch(/user_private|org_private/)
  })

  it("commits blocked actor probes and resets only after the hour window", async () => {
    const reserve = (recipientCount: number, at = now) =>
      reserveInvitationQuota(database, {
        actorUserId: "user_private",
        organizationId: "org_private",
        recipientCount,
        now: at,
      })

    await expect(reserve(20)).resolves.toBeUndefined()
    await expect(reserve(10)).resolves.toBeUndefined()
    const blocked = await reserve(1).catch((cause: unknown) => cause)
    expect(blocked).toBeInstanceOf(AppError)
    expect(blocked).toMatchObject({
      code: "rate_limited",
      publicContext: { retryAfter: 3600 },
      statusCode: 429,
    })

    const rows = await database.select().from(rateLimit)
    expect(rows.map(({ count }) => count)).toEqual([31, 31])
    expect(JSON.stringify(rows)).not.toMatch(/user_private|org_private/)

    await expect(
      reserve(1, new Date(now.getTime() + 60 * 60 * 1000 + 1))
    ).resolves.toBeUndefined()
    expect(
      (await database.select().from(rateLimit)).map(({ count }) => count)
    ).toEqual([1, 1])
  })

  it("enforces the organization-wide quota across different actors", async () => {
    for (let index = 0; index < 4; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- 各reservationのcommit後に次actorを検証する。
      await reserveInvitationQuota(database, {
        actorUserId: `actor_${index}`,
        organizationId: "org_private",
        recipientCount: 25,
        now,
      })
    }

    await expect(
      reserveInvitationQuota(database, {
        actorUserId: "actor_5",
        organizationId: "org_private",
        recipientCount: 1,
        now,
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
      publicContext: { retryAfter: 3600 },
    })

    const organizationKey = await invitationQuotaKey("organization", [
      "org_private",
    ])
    expect(
      (await database.select().from(rateLimit)).find(
        ({ key }) => key === organizationKey
      )?.count
    ).toBe(101)
  })
})
