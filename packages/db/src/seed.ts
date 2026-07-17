import { faker } from "@faker-js/faker"
import { createClient } from "@libsql/client"
import { count, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { seed } from "drizzle-seed"

import { assertLocalDatabaseUrl } from "./local-database"
import * as schema from "./schema/index"

const SEED = 42 as const

export type DatabaseConnectionOptions = {
  url: string
  authToken?: string
}

const createSeedDatabase = (connection: DatabaseConnectionOptions) => {
  const client = createClient({
    url: connection.url,
    authToken: connection.authToken,
  })

  return {
    client,
    db: drizzle(client),
  }
}

export const seedDevelopmentDatabase = async (
  connection?: DatabaseConnectionOptions
) => {
  const resolvedConnection: DatabaseConnectionOptions =
    connection ??
    (await import("./env").then(
      ({ env }) =>
        ({
          url: env.TURSO_DATABASE_URL,
          authToken: env.TURSO_AUTH_TOKEN,
        }) satisfies DatabaseConnectionOptions
    ))
  assertLocalDatabaseUrl(resolvedConnection.url)
  const { client, db } = createSeedDatabase(resolvedConnection)

  try {
    const [userCountResult] = await db
      .select({ value: count() })
      .from(schema.user)
    const userCount = userCountResult?.value ?? 0

    if (userCount > 0) {
      console.log(
        "Seed skipped: the database already contains users. Run db:reset explicitly to rebuild local seed data."
      )
      return
    }

    faker.seed(SEED)

    // drizzle-seed は独立したroot entityだけ生成し、tenant FKを持つdataは
    // 下で明示的に組み立てる。これによりorg境界とissue番号を決定的に保つ。
    await seed(
      db,
      { organization: schema.organization, user: schema.user },
      { seed: SEED }
    ).refine((f) => ({
      user: {
        count: 20,
        columns: {
          id: f.uuid(),
          name: f.fullName(),
          email: f.email(),
          emailVerified: f.default({ defaultValue: true }),
          image: f.default({ defaultValue: "" }),
        },
      },
      organization: {
        count: 5,
        columns: {
          id: f.uuid(),
          name: f.companyName(),
          slug: f.string({ isUnique: true }),
          logo: f.default({ defaultValue: "" }),
        },
      },
    }))

    const users = await db
      .select({ id: schema.user.id, email: schema.user.email })
      .from(schema.user)
      .orderBy(schema.user.id)
    const organizations = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .orderBy(schema.organization.id)

    const accountRows: Array<typeof schema.account.$inferInsert> = users.map(
      ({ id, email }) => ({
        id: faker.string.uuid(),
        accountId: email,
        providerId: "credential",
        userId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    )
    await db.insert(schema.account).values(accountRows)

    const memberUserIdsByOrganization = new Map<string, string[]>()
    for (const [userIndex, { id: userId }] of users.entries()) {
      const primary = organizations[userIndex % organizations.length]
      const secondary = organizations[(userIndex + 1) % organizations.length]

      for (const organization of [primary, secondary]) {
        if (!organization) continue
        const memberUserIds =
          memberUserIdsByOrganization.get(organization.id) ?? []
        if (!memberUserIds.includes(userId)) memberUserIds.push(userId)
        memberUserIdsByOrganization.set(organization.id, memberUserIds)
      }
    }

    const memberRows: Array<typeof schema.member.$inferInsert> = []
    for (const { id: organizationId } of organizations) {
      const memberUserIds =
        memberUserIdsByOrganization.get(organizationId) ?? []
      for (const [memberIndex, userId] of memberUserIds.entries()) {
        memberRows.push({
          id: faker.string.uuid(),
          organizationId,
          userId,
          role:
            memberIndex === 0
              ? "super_admin"
              : memberIndex === 1
                ? "admin"
                : "member",
          createdAt: new Date(),
        })
      }
    }
    await db.insert(schema.member).values(memberRows)

    const invitationRows: Array<typeof schema.invitation.$inferInsert> = []
    for (const { id: organizationId } of organizations) {
      const inviterId = memberUserIdsByOrganization.get(organizationId)?.[0]
      if (!inviterId) continue

      for (let index = 0; index < 2; index += 1) {
        invitationRows.push({
          id: faker.string.uuid(),
          organizationId,
          email: faker.internet.email(),
          role: index === 0 ? "member" : "admin",
          status: "pending",
          expiresAt: faker.date.soon({ days: 7 }),
          inviterId,
        })
      }
    }
    await db.insert(schema.invitation).values(invitationRows)

    const issueRows: Array<typeof schema.issues.$inferInsert> = []
    const commentRows: Array<typeof schema.issueComments.$inferInsert> = []
    const availableLabels = ["bug", "feature", "docs", "security"]

    for (const { id: organizationId } of organizations) {
      const memberUserIds =
        memberUserIdsByOrganization.get(organizationId) ?? []
      const creatorId = memberUserIds[0]
      if (!creatorId) continue

      const issueCount = faker.number.int({ min: 6, max: 10 })
      for (let index = 0; index < issueCount; index += 1) {
        const id = faker.string.uuid()
        const createdAt = faker.date.recent({ days: 45 })
        const labels = faker.helpers
          .shuffle(availableLabels)
          .slice(0, faker.number.int({ min: 0, max: 2 }))

        issueRows.push({
          id,
          organizationId,
          number: index + 1,
          title: faker.company.catchPhrase(),
          description: faker.lorem.paragraph(),
          status: faker.helpers.arrayElement(schema.issueStatuses),
          priority: faker.helpers.arrayElement(schema.issuePriorities),
          assigneeId: faker.datatype.boolean({ probability: 0.7 })
            ? faker.helpers.arrayElement(memberUserIds)
            : null,
          creatorId,
          labels,
          dueDate: faker.datatype.boolean({ probability: 0.45 })
            ? faker.date.soon({ days: 60 })
            : null,
          createdAt,
          updatedAt: createdAt,
        })

        const commentCount = faker.number.int({ min: 0, max: 3 })
        for (
          let commentIndex = 0;
          commentIndex < commentCount;
          commentIndex += 1
        ) {
          const commentCreatedAt = faker.date.between({
            from: createdAt,
            to: new Date(),
          })
          commentRows.push({
            id: faker.string.uuid(),
            issueId: id,
            organizationId,
            authorId: faker.helpers.arrayElement(memberUserIds),
            body: faker.lorem.sentences({ min: 1, max: 3 }),
            createdAt: commentCreatedAt,
            updatedAt: commentCreatedAt,
          })
        }
      }
    }

    await db.insert(schema.issues).values(issueRows)
    if (commentRows.length > 0) {
      await db.insert(schema.issueComments).values(commentRows)
    }

    await Promise.all(
      users.map(({ id }) =>
        db
          .update(schema.user)
          .set({ image: faker.image.avatar() })
          .where(eq(schema.user.id, id))
      )
    )
    await Promise.all(
      organizations.map(({ id }) =>
        db
          .update(schema.organization)
          .set({
            logo: `https://api.dicebear.com/9.x/shapes/svg?size=256&seed=${faker.string.alphanumeric(12)}`,
          })
          .where(eq(schema.organization.id, id))
      )
    )

    console.log(
      `Seed completed: ${users.length} users, ${organizations.length} organizations, ${issueRows.length} issues, ${commentRows.length} comments.`
    )
  } finally {
    client.close()
  }
}

if (import.meta.main) {
  await seedDevelopmentDatabase()
}
