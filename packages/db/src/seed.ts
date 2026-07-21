import { faker } from "@faker-js/faker"
import { createClient } from "@libsql/client"
import { count, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { seed } from "drizzle-seed"

import {
  DEVELOPMENT_SEED,
  DEVELOPMENT_SEED_REFERENCE_DATE,
  DEVELOPMENT_USER_AVATAR_URL_PREFIX,
  developmentFileFixtures,
  developmentSeedAnchors,
  getDevelopmentUserAvatarUrl,
} from "./development-seed"
import { assertLocalDatabaseUrl } from "./local-database"
import * as schema from "./schema/index"

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

const addMember = (
  membersByOrganization: Map<string, string[]>,
  organizationId: string,
  userId: string
) => {
  const members = membersByOrganization.get(organizationId) ?? []
  if (!members.includes(userId)) members.push(userId)
  membersByOrganization.set(organizationId, members)
}

export const seedDevelopmentDatabase = async (
  connection?: DatabaseConnectionOptions
) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development database seed is disabled in production.")
  }
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

    faker.seed(DEVELOPMENT_SEED)
    faker.setDefaultRefDate(DEVELOPMENT_SEED_REFERENCE_DATE)
    const referenceDate = new Date(DEVELOPMENT_SEED_REFERENCE_DATE)

    const summary = await db.transaction(async (tx) => {
      // drizzle-seed は独立したroot entityだけ生成し、anchorとtenant dataは
      // 同じtransaction内で明示的に組み立てる。
      await seed(
        tx,
        { organization: schema.organization, user: schema.user },
        { seed: DEVELOPMENT_SEED }
      ).refine((f) => ({
        user: {
          count: 18,
          columns: {
            id: f.uuid(),
            name: f.fullName(),
            email: f.email(),
            emailVerified: f.default({ defaultValue: true }),
            image: f.default({ defaultValue: "" }),
            createdAt: f.default({ defaultValue: referenceDate }),
            updatedAt: f.default({ defaultValue: referenceDate }),
          },
        },
        organization: {
          count: 3,
          columns: {
            id: f.uuid(),
            name: f.companyName(),
            slug: f.string({ isUnique: true }),
            logo: f.default({ defaultValue: "" }),
            createdAt: f.default({ defaultValue: referenceDate }),
          },
        },
      }))

      await tx.update(schema.user).set({
        image: sql`${DEVELOPMENT_USER_AVATAR_URL_PREFIX} || ${schema.user.id}`,
        updatedAt: referenceDate,
      })

      await tx.insert(schema.user).values(
        developmentSeedAnchors.users.map((user) => ({
          ...user,
          emailVerified: true,
          image: getDevelopmentUserAvatarUrl(user.id),
          createdAt: referenceDate,
          updatedAt: referenceDate,
        }))
      )
      await tx.insert(schema.organization).values(
        developmentSeedAnchors.organizations.map((organization) => ({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo: "",
          createdAt: referenceDate,
        }))
      )

      const users = await tx
        .select({ id: schema.user.id, email: schema.user.email })
        .from(schema.user)
        .orderBy(schema.user.id)
      const organizations = await tx
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .orderBy(schema.organization.id)

      await tx.insert(schema.account).values(
        users.map(({ id, email }) => ({
          id: faker.string.uuid(),
          accountId: email,
          providerId: "credential",
          userId: id,
          createdAt: referenceDate,
          updatedAt: referenceDate,
        }))
      )

      const memberUserIdsByOrganization = new Map<string, string[]>()
      for (const [userIndex, { id: userId }] of users.entries()) {
        const primary = organizations[userIndex % organizations.length]
        const secondary = organizations[(userIndex + 1) % organizations.length]

        if (primary) addMember(memberUserIdsByOrganization, primary.id, userId)
        if (secondary) {
          addMember(memberUserIdsByOrganization, secondary.id, userId)
        }
      }

      for (const [
        index,
        anchor,
      ] of developmentSeedAnchors.organizations.entries()) {
        const secondaryAnchorUser =
          developmentSeedAnchors.users[(index + 1) % 2]
        const existing = memberUserIdsByOrganization.get(anchor.id) ?? []
        memberUserIdsByOrganization.set(anchor.id, [
          anchor.primaryUserId,
          ...(secondaryAnchorUser ? [secondaryAnchorUser.id] : []),
          ...existing.filter(
            (userId) =>
              userId !== anchor.primaryUserId &&
              userId !== secondaryAnchorUser?.id
          ),
        ])
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
            createdAt: referenceDate,
          })
        }
      }
      await tx.insert(schema.member).values(memberRows)

      const invitationRows: Array<typeof schema.invitation.$inferInsert> = []
      for (const { id: organizationId } of organizations) {
        const inviterId = memberUserIdsByOrganization.get(organizationId)?.[0]
        if (!inviterId) continue

        for (let index = 0; index < 2; index += 1) {
          invitationRows.push({
            id: faker.string.uuid(),
            organizationId,
            email: faker.internet.email().toLowerCase(),
            role: index === 0 ? "member" : "admin",
            status: "pending",
            expiresAt: faker.date.soon({ days: 7 }),
            createdAt: referenceDate,
            inviterId,
          })
        }
      }
      await tx.insert(schema.invitation).values(invitationRows)

      const issueRows: Array<typeof schema.issues.$inferInsert> =
        developmentSeedAnchors.issues.map((issue) => ({
          ...issue,
          description: "Deterministic file storage development fixture.",
          status: "open",
          priority: "medium",
          labels: ["feature"],
          createdAt: referenceDate,
          updatedAt: referenceDate,
        }))
      const commentRows: Array<typeof schema.issueComments.$inferInsert> = []
      const availableLabels = ["bug", "feature", "docs", "security"]
      const anchorOrganizationIds = new Set<string>(
        developmentSeedAnchors.organizations.map(({ id }) => id)
      )

      for (const { id: organizationId } of organizations) {
        const memberUserIds =
          memberUserIdsByOrganization.get(organizationId) ?? []
        const creatorId = memberUserIds[0]
        if (!creatorId) continue

        const issueCount = faker.number.int({ min: 6, max: 10 })
        const firstNumber = anchorOrganizationIds.has(organizationId) ? 2 : 1
        for (let index = 0; index < issueCount; index += 1) {
          const id = faker.string.uuid()
          const createdAt = faker.date.recent({ days: 45 })
          const labels = faker.helpers
            .shuffle(availableLabels)
            .slice(0, faker.number.int({ min: 0, max: 2 }))

          issueRows.push({
            id,
            organizationId,
            number: firstNumber + index,
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
              to: referenceDate,
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

      await tx.insert(schema.issues).values(issueRows)
      if (commentRows.length > 0) {
        await tx.insert(schema.issueComments).values(commentRows)
      }

      await tx.insert(schema.files).values(
        developmentFileFixtures.map((fixture) => ({
          id: fixture.id,
          organizationId: fixture.organizationId,
          uploaderId: fixture.uploaderId,
          uploadId: fixture.uploadId,
          ownerType: fixture.ownerType,
          objectKey: fixture.objectKey,
          filename: fixture.filename,
          sizeBytes: fixture.sizeBytes,
          declaredContentType: fixture.declaredContentType,
          status: "pending" as const,
          createdAt: referenceDate,
          updatedAt: referenceDate,
        }))
      )
      await tx.insert(schema.issueFileOwners).values(
        developmentFileFixtures.map((fixture) => ({
          fileId: fixture.id,
          organizationId: fixture.organizationId,
          ownerType: fixture.ownerType,
          issueId: fixture.ownerId,
        }))
      )

      const usageByOrganization = new Map<string, number>()
      for (const fixture of developmentFileFixtures) {
        usageByOrganization.set(
          fixture.organizationId,
          (usageByOrganization.get(fixture.organizationId) ?? 0) +
            fixture.sizeBytes
        )
      }
      await tx.insert(schema.organizationFileUsage).values(
        organizations.map(({ id: organizationId }) => ({
          organizationId,
          usedBytes: usageByOrganization.get(organizationId) ?? 0,
          updatedAt: referenceDate,
        }))
      )

      return {
        users: users.length,
        organizations: organizations.length,
        issues: issueRows.length,
        comments: commentRows.length,
        files: developmentFileFixtures.length,
      }
    })

    console.log(
      `Seed completed: ${summary.users} users, ${summary.organizations} organizations, ${summary.issues} issues, ${summary.comments} comments, ${summary.files} pending files.`
    )
  } finally {
    client.close()
  }
}

if (import.meta.main) {
  await seedDevelopmentDatabase()
}
