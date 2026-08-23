import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

const migrationsFolder = new URL("../drizzle-v3", import.meta.url).pathname

const insertControlPlaneFixture = async (
  client: ReturnType<typeof createClient>
) => {
  const now = Date.now()
  await client.batch([
    {
      sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
      args: [
        "agent-user",
        "Agent User",
        "agent-user@example.test",
        1,
        now,
        now,
      ],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: ["agent-org-a", "Agent Org A", "agent-org-a", now],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: ["agent-org-b", "Agent Org B", "agent-org-b", now],
    },
    {
      sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id,active_organization_id) values(?,?,?,?,?,?,?)",
      args: [
        "agent-session",
        now + 3_600_000,
        "agent-session-token",
        now,
        now,
        "agent-user",
        "agent-org-a",
      ],
    },
    {
      sql: "insert into agent_session_contexts(session_id,user_id,context_epoch,updated_at) values(?,?,?,?)",
      args: ["agent-session", "agent-user", 1, now],
    },
    {
      sql: "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values(?,?,?,?,?,?)",
      args: [
        "agent-thread-a",
        "agent-org-a",
        "agent-user",
        "active",
        now,
        null,
      ],
    },
    {
      sql: "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values(?,?,?,?,?,?)",
      args: [
        "agent-thread-b",
        "agent-org-b",
        "agent-user",
        "active",
        now,
        null,
      ],
    },
  ])
  return now
}

const insertRootRun = (
  client: ReturnType<typeof createClient>,
  input: {
    clientMessageId: string
    id: string
    now: number
    organizationId?: string
    threadId?: string
  }
) =>
  client.execute({
    sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
    args: [
      input.id,
      input.organizationId ?? "agent-org-a",
      input.threadId ?? "agent-thread-a",
      input.id,
      "agent-session",
      "agent-user",
      1,
      input.clientMessageId,
      "running",
      "chat",
      input.now,
      input.now + 300_000,
    ],
  })

describe("Agent control-plane schema", () => {
  it("enforces tenant-scoped run references and message idempotency", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle({ client }), { migrationsFolder })
      const now = await insertControlPlaneFixture(client)
      await insertRootRun(client, {
        id: "agent-run-a",
        clientMessageId: "message-shared",
        now,
      })

      await expect(
        insertRootRun(client, {
          id: "agent-run-a-duplicate",
          clientMessageId: "message-shared",
          now,
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        insertRootRun(client, {
          id: "agent-run-b",
          clientMessageId: "message-shared",
          now,
          organizationId: "agent-org-b",
          threadId: "agent-thread-b",
        })
      ).resolves.toBeDefined()
      await expect(
        insertRootRun(client, {
          id: "agent-run-cross-tenant",
          clientMessageId: "message-cross-tenant",
          now,
          organizationId: "agent-org-b",
          threadId: "agent-thread-a",
        })
      ).rejects.toThrow(/foreign key/i)
      await expect(
        client.execute(
          "update agent_runs set status = 'executing' where id = 'agent-run-a'"
        )
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute(
          "update agent_runs set tool_count = -1 where id = 'agent-run-a'"
        )
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute(
          "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values('invalid-thread','agent-org-a','agent-user','active',1,1)"
        )
      ).rejects.toThrow(/check constraint/i)
    } finally {
      client.close()
    }
  })

  it("enforces one-time ticket and scoped reusable grant invariants", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle({ client }), { migrationsFolder })
      const now = await insertControlPlaneFixture(client)
      await insertRootRun(client, {
        id: "agent-run-a",
        clientMessageId: "message-a",
        now,
      })

      await expect(
        client.execute({
          sql: "insert into agent_connection_tickets(id,token_hash,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "invalid-hash-ticket",
            "A".repeat(64),
            "agent-org-a",
            "agent-thread-a",
            "agent-session",
            "agent-user",
            1,
            now,
            now + 60_000,
          ],
        })
      ).rejects.toThrow(/check constraint/i)

      const ticketHash = "a".repeat(64)
      await client.execute({
        sql: "insert into agent_connection_tickets(id,token_hash,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?)",
        args: [
          "agent-ticket",
          ticketHash,
          "agent-org-a",
          "agent-thread-a",
          "agent-session",
          "agent-user",
          1,
          now,
          now + 60_000,
        ],
      })
      await expect(
        client.execute({
          sql: "insert into agent_connection_tickets(id,token_hash,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "duplicate-agent-ticket",
            ticketHash,
            "agent-org-a",
            "agent-thread-a",
            "agent-session",
            "agent-user",
            1,
            now,
            now + 60_000,
          ],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        client.execute({
          sql: "insert into agent_connection_tickets(id,token_hash,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "long-agent-ticket",
            "b".repeat(64),
            "agent-org-a",
            "agent-thread-a",
            "agent-session",
            "agent-user",
            1,
            now,
            now + 60_001,
          ],
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "update agent_connection_tickets set consumed_at = ?, revoked_at = ? where id = ?",
          args: [now + 1, now + 1, "agent-ticket"],
        })
      ).rejects.toThrow(/check constraint/i)

      await client.execute({
        sql: "insert into agent_grants(id,token_hash,kind,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
        args: [
          "connection-grant",
          "c".repeat(64),
          "connection",
          "agent-org-a",
          "agent-thread-a",
          "agent-session",
          "agent-user",
          1,
          now,
          now + 300_000,
        ],
      })
      await expect(
        client.execute({
          sql: "insert into agent_grants(id,token_hash,kind,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "run-grant-without-run",
            "d".repeat(64),
            "run",
            "agent-org-a",
            "agent-thread-a",
            "agent-session",
            "agent-user",
            1,
            now,
            now + 300_000,
          ],
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "insert into agent_grants(id,token_hash,kind,organization_id,thread_id,run_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "cross-tenant-run-grant",
            "e".repeat(64),
            "run",
            "agent-org-b",
            "agent-thread-b",
            "agent-run-a",
            "agent-session",
            "agent-user",
            1,
            now,
            now + 300_000,
          ],
        })
      ).rejects.toThrow(/foreign key/i)
    } finally {
      client.close()
    }
  })

  it("cascades ephemeral capabilities when their session is deleted", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle({ client }), { migrationsFolder })
      const now = await insertControlPlaneFixture(client)
      await insertRootRun(client, {
        id: "agent-run-a",
        clientMessageId: "message-a",
        now,
      })
      await client.batch([
        {
          sql: "insert into agent_connection_tickets(id,token_hash,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "agent-ticket",
            "f".repeat(64),
            "agent-org-a",
            "agent-thread-a",
            "agent-session",
            "agent-user",
            1,
            now,
            now + 60_000,
          ],
        },
        {
          sql: "insert into agent_grants(id,token_hash,kind,organization_id,thread_id,run_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "agent-run-grant",
            "0".repeat(64),
            "run",
            "agent-org-a",
            "agent-thread-a",
            "agent-run-a",
            "agent-session",
            "agent-user",
            1,
            now,
            now + 300_000,
          ],
        },
      ])

      await client.execute("delete from session where id = 'agent-session'")

      const counts = await Promise.all(
        [
          "agent_session_contexts",
          "agent_runs",
          "agent_connection_tickets",
          "agent_grants",
        ].map((table) =>
          client.execute(`select count(*) as count from ${table}`)
        )
      )
      expect(counts.map(({ rows }) => Number(rows[0]?.count))).toEqual([
        0, 0, 0, 0,
      ])
    } finally {
      client.close()
    }
  })
})
