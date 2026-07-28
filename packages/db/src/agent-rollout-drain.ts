import { createClient, type Client } from "@libsql/client"

const AGENT_DRAIN_MAX_ACTIVE_LIFETIME_MS = 5 * 60_000
const AGENT_DRAIN_GRACE_MS = 60_000
const AGENT_DRAIN_POLL_INTERVAL_MS = 5_000

export type AgentDrainState = {
  activeGrants: number
  activeResumeTickets: number
  activeRuns: number
  activeTickets: number
}

export const isAgentDrainComplete = (state: AgentDrainState): boolean =>
  state.activeGrants === 0 &&
  state.activeResumeTickets === 0 &&
  state.activeRuns === 0 &&
  state.activeTickets === 0

const count = (value: unknown): number => {
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "number" && Number.isSafeInteger(value)) return value
  throw new Error("Agent rollout drain query returned an invalid count")
}

export const readAgentDrainState = async (
  client: Pick<Client, "execute">
): Promise<AgentDrainState> => {
  const tableResult = await client.execute(
    `select name from sqlite_master
     where type = 'table'
       and name in (
         'agent_connection_tickets',
         'agent_grants',
         'agent_resume_tickets',
         'agent_runs'
       )`
  )
  const tables = new Set(
    tableResult.rows.map((row) => {
      if (typeof row.name !== "string") {
        throw new Error("Agent rollout drain table inventory is invalid")
      }
      return row.name
    })
  )
  const expectedTables = [
    "agent_connection_tickets",
    "agent_grants",
    "agent_resume_tickets",
    "agent_runs",
  ]
  if (tables.size !== 0 && expectedTables.some((table) => !tables.has(table))) {
    throw new Error("Agent rollout drain found a partial control-plane schema")
  }
  if (tables.size === 0) {
    return {
      activeGrants: 0,
      activeResumeTickets: 0,
      activeRuns: 0,
      activeTickets: 0,
    }
  }
  const result = await client.execute(`
    with clock(now_ms) as (
      select cast(unixepoch('subsecond') * 1000 as integer)
    )
    select
      (
        select count(*)
        from agent_connection_tickets, clock
        where consumed_at is null
          and revoked_at is null
          and expires_at > clock.now_ms
      ) as activeTickets,
      (
        select count(*)
        from agent_grants, clock
        where revoked_at is null
          and expires_at > clock.now_ms
      ) as activeGrants,
      (
        select count(*)
        from agent_resume_tickets, clock
        where consumed_at is null
          and revoked_at is null
          and expires_at > clock.now_ms
      ) as activeResumeTickets,
      (
        select count(*)
        from agent_runs, clock
        where status in ('running', 'waiting_approval')
          and expires_at > clock.now_ms
      ) as activeRuns
  `)
  const row = result.rows[0]
  return {
    activeTickets: count(row?.activeTickets),
    activeGrants: count(row?.activeGrants),
    activeResumeTickets: count(row?.activeResumeTickets),
    activeRuns: count(row?.activeRuns),
  }
}

export const waitForAgentDrain = async ({
  readState,
  sleep,
  timeoutMs,
  intervalMs,
  stabilityMs,
  now,
}: {
  intervalMs: number
  now: () => number
  readState: (now: Date) => Promise<AgentDrainState>
  sleep: (durationMs: number) => Promise<void>
  stabilityMs: number
  timeoutMs: number
}): Promise<AgentDrainState> => {
  const deadline = now() + timeoutMs
  let emptySince: number | null = null
  while (true) {
    const readTimeoutMs = Math.max(1, deadline - now())
    let readTimeout: ReturnType<typeof setTimeout> | undefined
    // oxlint-disable-next-line no-await-in-loop -- bounded drain polling is sequential.
    const state = await Promise.race([
      readState(new Date(now())),
      new Promise<never>((_, reject) => {
        readTimeout = setTimeout(
          () => reject(new Error("Agent rollout drain state read timed out")),
          readTimeoutMs
        )
      }),
    ]).finally(() => clearTimeout(readTimeout))
    const observedAt = now()
    if (isAgentDrainComplete(state)) {
      emptySince ??= observedAt
      if (observedAt - emptySince >= stabilityMs) return state
    } else {
      emptySince = null
    }
    if (now() >= deadline) {
      throw new Error(
        `Agent rollout drain timed out: tickets=${state.activeTickets}, grants=${state.activeGrants}, resumeTickets=${state.activeResumeTickets}, runs=${state.activeRuns}`
      )
    }
    // oxlint-disable-next-line no-await-in-loop -- the next read must follow this delay.
    await sleep(intervalMs)
  }
}

if (import.meta.main) {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    throw new Error("Agent rollout drain requires database credentials")
  }
  const client = createClient({ url, authToken })
  try {
    const state = await waitForAgentDrain({
      intervalMs: AGENT_DRAIN_POLL_INTERVAL_MS,
      now: Date.now,
      readState: () => readAgentDrainState(client),
      sleep: (durationMs) =>
        new Promise((resolve) => setTimeout(resolve, durationMs)),
      stabilityMs: AGENT_DRAIN_GRACE_MS,
      timeoutMs:
        AGENT_DRAIN_MAX_ACTIVE_LIFETIME_MS +
        2 * AGENT_DRAIN_GRACE_MS +
        AGENT_DRAIN_POLL_INTERVAL_MS,
    })
    process.stdout.write(`${JSON.stringify(state)}\n`)
  } finally {
    client.close()
  }
}
