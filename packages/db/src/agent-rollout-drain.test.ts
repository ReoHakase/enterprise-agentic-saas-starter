import { createClient } from "@libsql/client"
import { describe, expect, it, vi } from "vitest"

import {
  isAgentDrainComplete,
  readAgentDrainState,
  waitForAgentDrain,
  type AgentDrainState,
} from "./agent-rollout-drain"

const active: AgentDrainState = {
  activeGrants: 2,
  activeResumeTickets: 1,
  activeRuns: 2,
  activeTickets: 1,
}
const drained: AgentDrainState = {
  activeGrants: 0,
  activeResumeTickets: 0,
  activeRuns: 0,
  activeTickets: 0,
}

describe("Agent rollout drain", () => {
  it("counts only unexpired capabilities and runs and accepts a fresh database", async () => {
    const client = createClient({ url: ":memory:" })
    try {
      await expect(readAgentDrainState(client)).resolves.toEqual(drained)
      await client.executeMultiple(`
        create table agent_connection_tickets (
          consumed_at integer,
          revoked_at integer,
          expires_at integer not null
        );
        create table agent_grants (
          kind text not null,
          revoked_at integer,
          expires_at integer not null
        );
        create table agent_resume_tickets (
          consumed_at integer,
          revoked_at integer,
          expires_at integer not null
        );
        create table agent_runs (
          status text not null,
          expires_at integer not null
        );
      `)
      const expired = Date.now() - 60_000
      const live = Date.now() + 60_000
      await client.batch([
        {
          sql: "insert into agent_connection_tickets values (null, null, ?), (null, null, ?), (?, null, ?)",
          args: [expired, live, Date.now(), live],
        },
        {
          sql: "insert into agent_grants values ('connection', null, ?), ('connection', null, ?), ('run', null, ?), ('run', ?, ?)",
          args: [expired, live, live, Date.now(), live],
        },
        {
          sql: "insert into agent_resume_tickets values (null, null, ?), (null, null, ?), (?, null, ?)",
          args: [expired, live, Date.now(), live],
        },
        {
          sql: "insert into agent_runs values ('running', ?), ('waiting_approval', ?), ('completed', ?)",
          args: [live, live, live],
        },
      ])

      await expect(readAgentDrainState(client)).resolves.toEqual(active)
    } finally {
      client.close()
    }
  })

  it("fails closed for a partially migrated control-plane schema", async () => {
    const client = createClient({ url: ":memory:" })
    try {
      await client.execute(
        "create table agent_runs (status text not null, expires_at integer not null)"
      )
      await expect(readAgentDrainState(client)).rejects.toThrow(
        "partial control-plane schema"
      )
    } finally {
      client.close()
    }
  })

  it("waits until every live capability and run is gone", async () => {
    let current = 0
    const readState = vi
      .fn<(now: Date) => Promise<AgentDrainState>>()
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(drained)
      .mockResolvedValueOnce(drained)

    await expect(
      waitForAgentDrain({
        intervalMs: 5,
        now: () => current,
        readState,
        sleep: async (durationMs) => {
          current += durationMs
        },
        stabilityMs: 5,
        timeoutMs: 15,
      })
    ).resolves.toEqual(drained)
    expect(readState).toHaveBeenCalledTimes(3)
    expect(isAgentDrainComplete(active)).toBe(false)
    expect(isAgentDrainComplete(drained)).toBe(true)
  })

  it("fails closed when the bounded drain deadline is reached", async () => {
    let current = 0
    await expect(
      waitForAgentDrain({
        intervalMs: 5,
        now: () => current,
        readState: async () => active,
        sleep: async (durationMs) => {
          current += durationMs
        },
        stabilityMs: 5,
        timeoutMs: 5,
      })
    ).rejects.toThrow("timed out: tickets=1, grants=2, resumeTickets=1, runs=2")
  })

  it("bounds a state read that never settles", async () => {
    await expect(
      waitForAgentDrain({
        intervalMs: 5,
        now: Date.now,
        readState: () => new Promise(() => {}),
        sleep: async () => {},
        stabilityMs: 5,
        timeoutMs: 10,
      })
    ).rejects.toThrow("state read timed out")
  })

  it("requires a continuous empty window and resets it for a late producer", async () => {
    let current = 0
    const readState = vi
      .fn<(now: Date) => Promise<AgentDrainState>>()
      .mockResolvedValueOnce(drained)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(drained)
      .mockResolvedValueOnce(drained)

    await expect(
      waitForAgentDrain({
        intervalMs: 5,
        now: () => current,
        readState,
        sleep: async (durationMs) => {
          current += durationMs
        },
        stabilityMs: 5,
        timeoutMs: 20,
      })
    ).resolves.toEqual(drained)
    expect(readState).toHaveBeenCalledTimes(4)
    expect(current).toBe(15)
  })

  it("does not accept an initially empty database before the grace window", async () => {
    let current = 0
    const readState = vi.fn<(now: Date) => Promise<AgentDrainState>>(
      async () => drained
    )
    await waitForAgentDrain({
      intervalMs: 5,
      now: () => current,
      readState,
      sleep: async (durationMs) => {
        current += durationMs
      },
      stabilityMs: 10,
      timeoutMs: 15,
    })
    expect(readState).toHaveBeenCalledTimes(3)
    expect(current).toBe(10)
  })
})
