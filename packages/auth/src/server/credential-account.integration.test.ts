import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { betterAuth } from "better-auth"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { expect, it } from "vitest"

it("stores a fresh credential account with the Better Auth 1.7 issuer", async () => {
  const client = createClient({ url: "file::memory:" })

  try {
    const database = drizzle({ client, relations: schema.relations })
    await migrate(database, {
      migrationsFolder: new URL("../../../db/drizzle-v3", import.meta.url)
        .pathname,
    })
    const credentialAuth = betterAuth({
      basePath: "/auth",
      baseURL: "http://api.localhost",
      database: drizzleAdapter(database, { provider: "sqlite", schema }),
      emailAndPassword: { enabled: true },
      secret: "test-secret-at-least-32-characters-long",
      trustedOrigins: ["http://app.localhost"],
    })
    const email = `credential-${crypto.randomUUID()}@example.test`

    const response = await credentialAuth.handler(
      new Request("http://api.localhost/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://app.localhost",
        },
        body: JSON.stringify({
          email,
          name: "Credential Account",
          password: "test-password-41",
        }),
      })
    )

    expect(response.status).toBe(200)
    const [storedUser] = await database
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
    expect(storedUser).toBeDefined()
    if (!storedUser) {
      throw new Error("Expected Better Auth to persist the signed-up user")
    }

    const storedAccounts = await database
      .select({
        accountId: schema.account.accountId,
        issuer: schema.account.issuer,
        providerId: schema.account.providerId,
        userId: schema.account.userId,
      })
      .from(schema.account)
      .where(eq(schema.account.userId, storedUser.id))
    expect(storedAccounts).toEqual([
      {
        accountId: storedUser.id,
        issuer: "local:credential",
        providerId: "credential",
        userId: storedUser.id,
      },
    ])
  } finally {
    client.close()
  }
})
