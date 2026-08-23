import { rm } from "node:fs/promises"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { createMigrationPrefix, migrationsFolder } from "./helpers"

const createLegacyOAuthDatabase = async () => {
  const client = createClient({ url: "file::memory:" })
  const migrationPrefix = await createMigrationPrefix({
    through: "0030_same_black_knight",
  })
  await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
  return { client, migrationPrefix }
}

const closeLegacyOAuthDatabase = async ({
  client,
  migrationPrefix,
}: Awaited<ReturnType<typeof createLegacyOAuthDatabase>>) => {
  client.close()
  await rm(migrationPrefix, { recursive: true, force: true })
}

const insertLegacyUser = (
  client: ReturnType<typeof createClient>,
  now: number
) =>
  client.execute({
    sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
    args: [
      "oauth-upgrade-user",
      "OAuth User",
      "oauth@example.test",
      1,
      now,
      now,
    ],
  })

describe("database migrations: OAuth provider upgrade", () => {
  it("adds OAuth provider tables without changing existing auth rows", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0028_chubby_blackheart",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await insertLegacyUser(client, now)

      await migrate(drizzle({ client }), { migrationsFolder })

      const user = await client.execute({
        sql: "select id,email from user where id = ?",
        args: ["oauth-upgrade-user"],
      })
      expect(user.rows).toEqual([
        { id: "oauth-upgrade-user", email: "oauth@example.test" },
      ])
      const oauthTables = await client.execute(
        "select name from sqlite_master where type = 'table' and name like 'oauth_%' order by name"
      )
      expect(oauthTables.rows.map(({ name }) => name)).toEqual([
        "oauth_access_token",
        "oauth_client",
        "oauth_client_assertion",
        "oauth_client_resource",
        "oauth_consent",
        "oauth_refresh_token",
        "oauth_resource",
      ])
      expect((await client.execute("pragma foreign_key_check")).rows).toEqual(
        []
      )
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("backfills trusted account issuers and OAuth client metadata without deleting legacy rows", async () => {
    const fixture = await createLegacyOAuthDatabase()
    const { client } = fixture
    const now = Date.now()

    try {
      await insertLegacyUser(client, now)
      await client.batch([
        {
          sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id) values(?,?,?,?,?,?)",
          args: [
            "oauth-upgrade-session",
            now + 3_600_000,
            "oauth-upgrade-session-token",
            now,
            now,
            "oauth-upgrade-user",
          ],
        },
        {
          sql: "insert into account(id,account_id,provider_id,user_id,password,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "legacy-credential-account",
            "oauth-upgrade-user",
            "credential",
            "oauth-upgrade-user",
            "legacy-password-hash",
            now,
            now,
          ],
        },
        {
          sql: "insert into account(id,account_id,provider_id,user_id,access_token,refresh_token,id_token,access_token_expires_at,refresh_token_expires_at,scope,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "legacy-github-account",
            "oauth-upgrade-user",
            "github",
            "oauth-upgrade-user",
            "legacy-github-access-token",
            "legacy-github-refresh-token",
            "legacy-github-id-token",
            now + 3_600_000,
            now + 7_200_000,
            "read:user",
            now,
            now,
          ],
        },
        {
          sql: "insert into oauth_client(id,client_id,redirect_uris,public,type) values(?,?,?,?,?)",
          args: [
            "legacy-public-client",
            "legacy-public-client-id",
            '["https://public.example.test/callback"]',
            1,
            "native",
          ],
        },
        {
          sql: "insert into oauth_client(id,client_id,redirect_uris,public,type) values(?,?,?,?,?)",
          args: [
            "legacy-browser-client",
            "legacy-browser-client-id",
            '["https://browser.example.test/callback"]',
            1,
            "user-agent-based",
          ],
        },
        {
          sql: "insert into oauth_client(id,client_id,client_secret,redirect_uris,public,type) values(?,?,?,?,?,?)",
          args: [
            "legacy-confidential-client",
            "legacy-confidential-client-id",
            "legacy-confidential-secret",
            '["https://confidential.example.test/callback"]',
            0,
            "web",
          ],
        },
        {
          sql: "insert into oauth_client(id,client_id,client_secret,redirect_uris,public,type,token_endpoint_auth_method) values(?,?,?,?,?,?,?)",
          args: [
            "legacy-explicit-client",
            "legacy-explicit-client-id",
            "legacy-explicit-secret",
            '["https://explicit.example.test/callback"]',
            0,
            "web",
            "client_secret_post",
          ],
        },
        {
          sql: "insert into oauth_refresh_token(id,token,client_id,session_id,user_id,reference_id,expires_at,created_at,revoked,auth_time,scopes) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "legacy-refresh-token",
            "legacy-refresh-token-value",
            "legacy-confidential-client-id",
            "oauth-upgrade-session",
            "oauth-upgrade-user",
            "legacy-org",
            now + 7_200_000,
            now,
            null,
            now,
            '["mcp:read"]',
          ],
        },
        {
          sql: "insert into oauth_access_token(id,token,client_id,session_id,user_id,reference_id,refresh_id,expires_at,created_at,scopes) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "legacy-access-token",
            "legacy-access-token-value",
            "legacy-confidential-client-id",
            "oauth-upgrade-session",
            "oauth-upgrade-user",
            "legacy-org",
            "legacy-refresh-token",
            now + 3_600_000,
            now,
            '["mcp:read"]',
          ],
        },
        {
          sql: "insert into oauth_consent(id,client_id,user_id,reference_id,scopes,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "legacy-consent",
            "legacy-confidential-client-id",
            "oauth-upgrade-user",
            "legacy-org",
            '["mcp:read"]',
            now,
            now,
          ],
        },
      ])

      await migrate(drizzle({ client }), { migrationsFolder })

      expect(
        (
          await client.execute(
            "select id,issuer,account_id,provider_id,user_id,access_token,refresh_token,id_token,access_token_expires_at,refresh_token_expires_at,scope,password from account order by id"
          )
        ).rows
      ).toEqual([
        {
          id: "legacy-credential-account",
          issuer: "local:credential",
          account_id: "oauth-upgrade-user",
          provider_id: "credential",
          user_id: "oauth-upgrade-user",
          access_token: null,
          refresh_token: null,
          id_token: null,
          access_token_expires_at: null,
          refresh_token_expires_at: null,
          scope: null,
          password: "legacy-password-hash",
        },
        {
          id: "legacy-github-account",
          issuer: "local:oauth:github",
          account_id: "oauth-upgrade-user",
          provider_id: "github",
          user_id: "oauth-upgrade-user",
          access_token: "legacy-github-access-token",
          refresh_token: "legacy-github-refresh-token",
          id_token: "legacy-github-id-token",
          access_token_expires_at: now + 3_600_000,
          refresh_token_expires_at: now + 7_200_000,
          scope: "read:user",
          password: null,
        },
      ])
      expect(
        (
          await client.execute(
            "select id,client_id,client_secret,public,type,application_type,client_credentials_scopes,token_endpoint_auth_method from oauth_client order by id"
          )
        ).rows
      ).toEqual([
        {
          id: "legacy-browser-client",
          client_id: "legacy-browser-client-id",
          client_secret: null,
          public: 1,
          type: "user-agent-based",
          application_type: "web",
          client_credentials_scopes: "[]",
          token_endpoint_auth_method: "none",
        },
        {
          id: "legacy-confidential-client",
          client_id: "legacy-confidential-client-id",
          client_secret: "legacy-confidential-secret",
          public: 0,
          type: "web",
          application_type: "web",
          client_credentials_scopes: "[]",
          token_endpoint_auth_method: "client_secret_basic",
        },
        {
          id: "legacy-explicit-client",
          client_id: "legacy-explicit-client-id",
          client_secret: "legacy-explicit-secret",
          public: 0,
          type: "web",
          application_type: "web",
          client_credentials_scopes: "[]",
          token_endpoint_auth_method: "client_secret_post",
        },
        {
          id: "legacy-public-client",
          client_id: "legacy-public-client-id",
          client_secret: null,
          public: 1,
          type: "native",
          application_type: "native",
          client_credentials_scopes: "[]",
          token_endpoint_auth_method: "none",
        },
      ])
      expect(
        (
          await client.execute(
            "select id,token,client_id,session_id,user_id,reference_id,refresh_id,authorization_code_id,resources,requested_user_info_claims,revoked,confirmation,scopes from oauth_access_token"
          )
        ).rows
      ).toEqual([
        {
          id: "legacy-access-token",
          token: "legacy-access-token-value",
          client_id: "legacy-confidential-client-id",
          session_id: "oauth-upgrade-session",
          user_id: "oauth-upgrade-user",
          reference_id: "legacy-org",
          refresh_id: "legacy-refresh-token",
          authorization_code_id: null,
          resources: null,
          requested_user_info_claims: null,
          revoked: null,
          confirmation: null,
          scopes: '["mcp:read"]',
        },
      ])
      expect(
        (
          await client.execute(
            "select id,token,client_id,session_id,user_id,reference_id,authorization_code_id,resources,requested_user_info_claims,revoked,rotated_at,rotation_replay_response,rotation_replay_expires_at,confirmation,scopes from oauth_refresh_token"
          )
        ).rows
      ).toEqual([
        {
          id: "legacy-refresh-token",
          token: "legacy-refresh-token-value",
          client_id: "legacy-confidential-client-id",
          session_id: "oauth-upgrade-session",
          user_id: "oauth-upgrade-user",
          reference_id: "legacy-org",
          authorization_code_id: null,
          resources: null,
          requested_user_info_claims: null,
          revoked: null,
          rotated_at: null,
          rotation_replay_response: null,
          rotation_replay_expires_at: null,
          confirmation: null,
          scopes: '["mcp:read"]',
        },
      ])
      expect(
        (
          await client.execute(
            "select id,client_id,user_id,reference_id,resources,requested_user_info_claims,scopes from oauth_consent"
          )
        ).rows
      ).toEqual([
        {
          id: "legacy-consent",
          client_id: "legacy-confidential-client-id",
          user_id: "oauth-upgrade-user",
          reference_id: "legacy-org",
          resources: null,
          requested_user_info_claims: null,
          scopes: '["mcp:read"]',
        },
      ])
      await expect(
        client.execute({
          sql: "insert into account(id,issuer,account_id,provider_id,user_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "duplicate-github-account",
            "local:oauth:github",
            "oauth-upgrade-user",
            "github",
            "oauth-upgrade-user",
            now,
            now,
          ],
        })
      ).rejects.toThrow(/unique/i)
      expect((await client.execute("pragma foreign_key_check")).rows).toEqual(
        []
      )
    } finally {
      await closeLegacyOAuthDatabase(fixture)
    }
  })

  it.each<{
    name: string
    seed: (
      client: ReturnType<typeof createClient>,
      now: number
    ) => Promise<unknown>
  }>([
    {
      name: "rejects an account from an untrusted provider",
      seed: (client, now) =>
        client.execute({
          sql: "insert into account(id,account_id,provider_id,user_id,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "unknown-provider-account",
            "unknown-subject",
            "unknown-provider",
            "oauth-upgrade-user",
            now,
            now,
          ],
        }),
    },
    {
      name: "rejects a credential account whose subject is not its user",
      seed: (client, now) =>
        client.execute({
          sql: "insert into account(id,account_id,provider_id,user_id,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "mismatched-credential-account",
            "different-user",
            "credential",
            "oauth-upgrade-user",
            now,
            now,
          ],
        }),
    },
    {
      name: "rejects colliding accounts in the same trusted issuer",
      seed: (client, now) =>
        client.batch([
          {
            sql: "insert into account(id,account_id,provider_id,user_id,created_at,updated_at) values(?,?,?,?,?,?)",
            args: [
              "colliding-github-account-a",
              "same-github-subject",
              "github",
              "oauth-upgrade-user",
              now,
              now,
            ],
          },
          {
            sql: "insert into account(id,account_id,provider_id,user_id,created_at,updated_at) values(?,?,?,?,?,?)",
            args: [
              "colliding-github-account-b",
              "same-github-subject",
              "github",
              "oauth-upgrade-user",
              now,
              now,
            ],
          },
        ]),
    },
    {
      name: "rejects an unknown legacy OAuth client application type",
      seed: (client) =>
        client.execute({
          sql: "insert into oauth_client(id,client_id,client_secret,redirect_uris,public,type) values(?,?,?,?,?,?)",
          args: [
            "unknown-type-client",
            "unknown-type-client-id",
            "unknown-type-secret",
            '["https://unknown.example.test/callback"]',
            0,
            "desktop",
          ],
        }),
    },
    {
      name: "rejects a confidential OAuth client with no authentication material",
      seed: (client) =>
        client.execute({
          sql: "insert into oauth_client(id,client_id,redirect_uris,public,type) values(?,?,?,?,?)",
          args: [
            "unclassifiable-client",
            "unclassifiable-client-id",
            '["https://unclassifiable.example.test/callback"]',
            0,
            "web",
          ],
        }),
    },
  ])("$name", async ({ seed }) => {
    const fixture = await createLegacyOAuthDatabase()
    const { client } = fixture
    const now = Date.now()

    try {
      await insertLegacyUser(client, now)
      await seed(client, now)

      await expect(
        migrate(drizzle({ client }), { migrationsFolder })
      ).rejects.toThrow(/constraint/i)
    } finally {
      await closeLegacyOAuthDatabase(fixture)
    }
  })
})
