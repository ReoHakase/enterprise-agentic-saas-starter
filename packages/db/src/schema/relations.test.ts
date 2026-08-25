import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { relations } from "./relations"

const migrationsFolder = new URL("../../drizzle-v3", import.meta.url).pathname

describe("schemaのリレーション", () => {
  it("Better AuthとOAuthの重複リレーションを同じqueryで取得できる", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      const db = drizzle({ client, relations })
      await migrate(db, { migrationsFolder })

      await expect(
        db.query.user.findFirst({
          with: {
            accounts: true,
            invitations: true,
            members: true,
            oauthAccessTokens: true,
            oauthClients: true,
            oauthConsents: true,
            oauthRefreshTokens: true,
            passkeys: true,
            sessions: true,
          },
        })
      ).resolves.toBeUndefined()
      await expect(
        db.query.session.findFirst({
          with: {
            oauthAccessTokens: true,
            oauthRefreshTokens: true,
            user: true,
          },
        })
      ).resolves.toBeUndefined()
    } finally {
      client.close()
    }
  })
})
