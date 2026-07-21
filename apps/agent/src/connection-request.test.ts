import type { AgentConnection } from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it } from "vitest"

import { readLiveConnectionGrant } from "./connection-grant"
import {
  handleConnectionRequest,
  type AgentLobby,
  type AgentRequestRouter,
  type ConnectionRequestEnvironment,
} from "./connection-request"

const WEB_ORIGIN = "https://app.example.com"
const THREAD_ID = "thread_01JZTEST"
const TICKET = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
const GRANT = "grant_0123456789abcdefghijklmnopqrstuvwxyz"
const EXPIRES_AT = "2030-01-01T00:00:00.000Z"

const connection = (threadId = THREAD_ID): AgentConnection => ({
  expiresAt: EXPIRES_AT,
  grant: GRANT,
  organization: {
    name: "Example",
    permissions: {
      canCreateIssues: true,
      canDeleteAnyIssue: false,
      canDeleteOwnIssues: true,
      canReadIssues: true,
      canUpdateIssues: true,
    },
    role: "member",
    slug: "example",
  },
  thread: { id: threadId, title: "Private thread" },
  user: { name: "User", profileImage: null },
})

const request = (
  path = `/agents/issue-assistant/${THREAD_ID}?ticket=${TICKET}`,
  options: { method?: string; origin?: string; upgrade?: string } = {}
): Request =>
  new Request(`https://agent.example.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      origin: options.origin ?? WEB_ORIGIN,
      upgrade: options.upgrade ?? "websocket",
      "x-enterprise-agent-connection-grant": "attacker-controlled",
    },
  })

type TestHarness = {
  calls: Array<{ ticket: string; threadId: string }>
  environment: ConnectionRequestEnvironment
  forwarded: Request[]
  route: AgentRequestRouter<ConnectionRequestEnvironment>
  routeCalls: Request[]
}

const harness = (
  options: {
    consume?: () => AgentConnection | Promise<AgentConnection>
    lobby?: AgentLobby
    routeMatched?: boolean
  } = {}
): TestHarness => {
  const calls: Array<{ ticket: string; threadId: string }> = []
  const forwarded: Request[] = []
  const routeCalls: Request[] = []
  const environment: ConnectionRequestEnvironment = {
    AGENT_INTERNAL_API: {
      consumeConnectionTicket: async (input) => {
        calls.push(input)
        return (await options.consume?.()) ?? connection()
      },
    },
    WEB_ORIGIN,
  }
  const route: AgentRequestRouter<ConnectionRequestEnvironment> = async (
    incoming,
    _environment,
    routeOptions
  ) => {
    routeCalls.push(incoming)
    if (options.routeMatched === false) return null
    const authenticated = await routeOptions.onBeforeConnect(
      incoming,
      options.lobby ?? {
        className: "IssueAssistant",
        name: THREAD_ID,
      }
    )
    if (authenticated instanceof Response) return authenticated
    if (authenticated instanceof Request) forwarded.push(authenticated)
    return new Response("routed")
  }

  return { calls, environment, forwarded, route, routeCalls }
}

describe("handleConnectionRequest", () => {
  it("consumes the expected thread ticket and scrubs it before Agent routing", async () => {
    const test = harness()

    const response = await handleConnectionRequest(
      request(),
      test.environment,
      test.route
    )

    expect(response.status).toBe(200)
    expect(test.calls).toEqual([{ threadId: THREAD_ID, ticket: TICKET }])
    expect(test.forwarded).toHaveLength(1)
    const forwarded = test.forwarded[0]
    expect(forwarded && new URL(forwarded.url).search).toBe("")
    expect(forwarded?.url).not.toContain(TICKET)
    expect(
      forwarded && readLiveConnectionGrant(forwarded, THREAD_ID, 0)
    ).toEqual({ expiresAt: EXPIRES_AT, grant: GRANT, threadId: THREAD_ID })
  })

  it.each([
    ["POST", "websocket", 405],
    ["GET", "", 426],
  ])(
    "rejects invalid method or upgrade before routing",
    async (method, upgrade, expectedStatus) => {
      const test = harness()
      const response = await handleConnectionRequest(
        request(undefined, { method, upgrade }),
        test.environment,
        test.route
      )

      expect(response.status).toBe(expectedStatus)
      expect(test.routeCalls).toHaveLength(0)
      expect(test.calls).toHaveLength(0)
    }
  )

  it("rejects every non-exact Agent route before ticket consumption", async () => {
    const test = harness()

    const response = await handleConnectionRequest(
      request(`/agents/issue-assistant/${THREAD_ID}/?ticket=${TICKET}`),
      test.environment,
      test.route
    )

    expect(response.status).toBe(404)
    expect(test.routeCalls).toHaveLength(0)
    expect(test.calls).toHaveLength(0)
  })

  it("requires the configured exact HTTPS Origin", async () => {
    const test = harness()

    const response = await handleConnectionRequest(
      request(undefined, { origin: "https://evil.example.com" }),
      test.environment,
      test.route
    )

    expect(response.status).toBe(401)
    expect(test.routeCalls).toHaveLength(0)
    expect(test.calls).toHaveLength(0)
  })

  it.each([
    `?ticket=${TICKET}&ticket=${TICKET}`,
    `?ticket=${TICKET}&debug=true`,
    "?ticket=short",
    "",
  ])("rejects a non-canonical ticket query: %s", async (query) => {
    const test = harness()

    const response = await handleConnectionRequest(
      request(`/agents/issue-assistant/${THREAD_ID}${query}`),
      test.environment,
      test.route
    )

    expect(response.status).toBe(401)
    expect(test.routeCalls).toHaveLength(0)
    expect(test.calls).toHaveLength(0)
  })

  it("rejects a ticket whose returned projection targets another thread", async () => {
    const test = harness({ consume: () => connection("another-thread") })

    const response = await handleConnectionRequest(
      request(),
      test.environment,
      test.route
    )

    expect(response.status).toBe(401)
    expect(test.forwarded).toHaveLength(0)
  })

  it("fails closed without leaking an internal ticket-consume error", async () => {
    const test = harness({
      consume: () => {
        throw new Error(`provider detail with ${TICKET}`)
      },
    })

    const response = await handleConnectionRequest(
      request(),
      test.environment,
      test.route
    )

    expect(response.status).toBe(401)
    await expect(response.text()).resolves.toBe("Connection rejected")
  })

  it("delegates every replay attempt to the atomic API consume", async () => {
    let attempts = 0
    const test = harness({
      consume: () => {
        attempts += 1
        if (attempts > 1) throw new Error("ticket already consumed")
        return connection()
      },
    })

    const first = await handleConnectionRequest(
      request(),
      test.environment,
      test.route
    )
    const replay = await handleConnectionRequest(
      request(),
      test.environment,
      test.route
    )

    expect(first.status).toBe(200)
    expect(replay.status).toBe(401)
    expect(test.calls).toHaveLength(2)
  })

  it("does not consume a ticket when the SDK lobby does not match", async () => {
    const test = harness({
      lobby: { className: "OtherAgent", name: THREAD_ID },
    })

    const response = await handleConnectionRequest(
      request(),
      test.environment,
      test.route
    )

    expect(response.status).toBe(404)
    expect(test.calls).toHaveLength(0)
  })

  it("returns 404 when the SDK does not route the strict path", async () => {
    const test = harness({ routeMatched: false })

    const response = await handleConnectionRequest(
      request(),
      test.environment,
      test.route
    )

    expect(response.status).toBe(404)
    expect(test.calls).toHaveLength(0)
  })
})
