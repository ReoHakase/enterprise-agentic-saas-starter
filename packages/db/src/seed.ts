import { faker } from "@faker-js/faker"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { seed, reset } from "drizzle-seed"

import { env } from "./env"
import * as schema from "./schema/index"

const SEED = 42 as const

const db = drizzle(
  createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
)

const main = async () => {
  faker.seed(SEED)
  await reset(db, schema)

  await seed(db, schema, { seed: SEED }).refine((f) => ({
    user: {
      count: 20,
      columns: {
        id: f.uuid(),
        name: f.fullName(),
        email: f.email(),
        emailVerified: f.default({ defaultValue: true }),
        image: f.default({ defaultValue: "" }),
      },
      with: {
        account: 1,
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
      with: {
        member: [
          { weight: 0.4, count: [3, 4] },
          { weight: 0.4, count: [5, 6, 7] },
          { weight: 0.2, count: [8, 10] },
        ],
        todos: [
          { weight: 0.3, count: [3, 5] },
          { weight: 0.4, count: [8, 10, 12] },
          { weight: 0.3, count: [15, 20] },
        ],
        invitation: [
          { weight: 0.7, count: 1 },
          { weight: 0.3, count: [2, 3] },
        ],
      },
    },
    member: {
      columns: {
        id: f.uuid(),
        role: f.valuesFromArray({
          values: ["owner", "admin", "member", "member", "member"],
        }),
      },
    },
    account: {
      columns: {
        id: f.uuid(),
        providerId: f.default({ defaultValue: "credential" }),
        accountId: f.string({ isUnique: true }),
      },
    },
    invitation: {
      columns: {
        id: f.uuid(),
        email: f.email(),
        role: f.valuesFromArray({ values: ["member", "admin"] }),
        status: f.default({ defaultValue: "pending" }),
      },
    },
    todos: {
      columns: {
        id: f.uuid(),
        title: f.loremIpsum({ sentencesCount: 1 }),
        completed: f.weightedRandom([
          { weight: 0.6, value: f.default({ defaultValue: false }) },
          { weight: 0.4, value: f.default({ defaultValue: true }) },
        ]),
      },
    },
  }))

  const users = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .orderBy(schema.user.id)
  const userUpdates = users.map(({ id }) => ({
    id,
    image: faker.image.avatar(),
  }))
  await Promise.all(
    userUpdates.map(({ id, image }) =>
      db.update(schema.user).set({ image }).where(eq(schema.user.id, id))
    )
  )

  const organizations = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(schema.organization.id)
  const organizationUpdates = organizations.map(({ id }) => ({
    id,
    logo: `https://api.dicebear.com/9.x/shapes/svg?size=256&seed=${faker.string.alphanumeric(12)}`,
  }))
  await Promise.all(
    organizationUpdates.map(({ id, logo }) =>
      db
        .update(schema.organization)
        .set({ logo })
        .where(eq(schema.organization.id, id))
    )
  )

  console.log("Seed completed.")
}

await main()
