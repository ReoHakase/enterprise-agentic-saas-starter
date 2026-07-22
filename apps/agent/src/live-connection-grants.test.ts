import { describe, expect, it } from "vitest"

import {
  readLiveConnectionGrant,
  type LiveConnectionGrant,
  withLiveConnectionGrant,
} from "./connection-grant"
import { LiveConnectionGrantStore } from "./live-connection-grants"

const NOW = Date.parse("2026-07-22T00:00:00.000Z")
const THREAD_ID = "thread_01JZTEST"
const CONNECTION_ID = "connection_01JZTEST"
const SECOND_CONNECTION_ID = "connection_02JZTEST"
const REQUEST_ID = "request_01JZTEST"

const liveGrant = (
  expiresAt = "2026-07-22T00:05:00.000Z"
): LiveConnectionGrant => ({
  expiresAt,
  grant: "grant_0123456789abcdefghijklmnopqrstuvwxyz",
  threadId: THREAD_ID,
})

const authenticatedRequest = (connection = liveGrant()): Request =>
  withLiveConnectionGrant(
    new Request(
      `https://agent.example.com/agents/issue-assistant/${THREAD_ID}?ticket=temporary_secret`
    ),
    connection
  )

describe("live connection grant handoff", () => {
  it("removes the ticket URL and reads only the private request headers", () => {
    const forwarded = authenticatedRequest()

    expect(new URL(forwarded.url).search).toBe("")
    expect(forwarded.url).not.toContain("temporary_secret")
    expect(readLiveConnectionGrant(forwarded, THREAD_ID, NOW)).toEqual(
      liveGrant()
    )
  })

  it("binds each chat request ID to the current live connection grant", () => {
    const store = new LiveConnectionGrantStore()
    expect(
      store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    ).toBe(true)

    const lease = store.openChatRequest(CONNECTION_ID, REQUEST_ID, NOW)
    expect(lease?.requestId).toBe(REQUEST_ID)
    expect(lease?.grant).toEqual(liveGrant())
    expect(store.chatRun(CONNECTION_ID, REQUEST_ID, NOW)).toEqual(liveGrant())
    expect(JSON.stringify(store)).toBe("{}")
    expect(JSON.stringify(store)).not.toContain(liveGrant().grant)

    lease?.release()
    expect(store.chatRun(CONNECTION_ID, REQUEST_ID, NOW)).toBeUndefined()
  })

  it("keeps cancel ownership only while an SDK continuation lease is active", () => {
    const store = new LiveConnectionGrantStore()
    store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    store.register(
      SECOND_CONNECTION_ID,
      authenticatedRequest({
        ...liveGrant(),
        grant: "grant_02abcdefghijklmnopqrstuvwxyz0123456789",
      }),
      THREAD_ID,
      NOW
    )

    const lease = store.openChatRequest(
      CONNECTION_ID,
      "continuation_01JZTEST",
      NOW
    )
    expect(lease?.grant).toEqual(liveGrant())
    expect(store.chatRun(CONNECTION_ID, "continuation_01JZTEST", NOW)).toEqual(
      liveGrant()
    )
    expect(
      store.chatRun(SECOND_CONNECTION_ID, "continuation_01JZTEST", NOW)
    ).toBeUndefined()
    expect(
      store.openChatRequest(CONNECTION_ID, "continuation_01JZTEST", NOW)
    ).toBeUndefined()

    lease?.release()
    lease?.release()
    expect(
      store.chatRun(CONNECTION_ID, "continuation_01JZTEST", NOW)
    ).toBeUndefined()
    const rebound = store.openChatRequest(
      CONNECTION_ID,
      "continuation_01JZTEST",
      NOW
    )
    expect(rebound).toBeDefined()
    rebound?.release()
    expect(
      store.openChatRequest(CONNECTION_ID, "invalid request", NOW)
    ).toBeUndefined()
  })

  it("does not retain completed continuation bindings across repeated runs", () => {
    const store = new LiveConnectionGrantStore()
    store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    const requestIds = Array.from(
      { length: 256 },
      (_, index) => `continuation_${index}`
    )

    for (const requestId of requestIds) {
      const lease = store.openChatRequest(CONNECTION_ID, requestId, NOW)
      expect(lease).toBeDefined()
      expect(store.chatRun(CONNECTION_ID, requestId, NOW)).toEqual(liveGrant())
      lease?.release()
      expect(store.chatRun(CONNECTION_ID, requestId, NOW)).toBeUndefined()
    }

    for (const requestId of requestIds) {
      const lease = store.openChatRequest(CONNECTION_ID, requestId, NOW)
      expect(lease).toBeDefined()
      lease?.release()
    }
  })

  it("keeps an initial chat run bound to its exact connection and request", () => {
    const store = new LiveConnectionGrantStore()
    store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    const lease = store.openChatRequest(CONNECTION_ID, REQUEST_ID, NOW)

    expect(store.chatRun(CONNECTION_ID, REQUEST_ID, NOW)).toEqual(liveGrant())
    expect(store.chatRun(SECOND_CONNECTION_ID, REQUEST_ID, NOW)).toBeUndefined()
    expect(
      store.chatRun(CONNECTION_ID, "request_02JZTEST", NOW)
    ).toBeUndefined()
    lease?.release()
  })

  it("has no grant after a simulated isolate wake and requires reconnect", () => {
    const beforeWake = new LiveConnectionGrantStore()
    expect(
      beforeWake.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    ).toBe(true)

    const afterWake = new LiveConnectionGrantStore()
    expect(afterWake.connection(CONNECTION_ID, NOW)).toBeUndefined()
    expect(
      afterWake.openChatRequest(CONNECTION_ID, REQUEST_ID, NOW)
    ).toBeUndefined()
  })

  it("removes request grants when their live connection closes", () => {
    const store = new LiveConnectionGrantStore()
    store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    const lease = store.openChatRequest(CONNECTION_ID, REQUEST_ID, NOW)

    store.removeConnection(CONNECTION_ID)

    expect(store.connection(CONNECTION_ID, NOW)).toBeUndefined()
    expect(store.chatRun(CONNECTION_ID, REQUEST_ID, NOW)).toBeUndefined()
    lease?.release()
  })

  it("never lets another live connection overwrite a bound request ID", () => {
    const firstGrant = liveGrant()
    const secondGrant = {
      ...liveGrant(),
      grant: "grant_02abcdefghijklmnopqrstuvwxyz0123456789",
    }
    const store = new LiveConnectionGrantStore()
    store.register(
      CONNECTION_ID,
      authenticatedRequest(firstGrant),
      THREAD_ID,
      NOW
    )
    store.register(
      SECOND_CONNECTION_ID,
      authenticatedRequest(secondGrant),
      THREAD_ID,
      NOW
    )

    const lease = store.openChatRequest(CONNECTION_ID, REQUEST_ID, NOW)
    expect(lease).toBeDefined()
    expect(
      store.openChatRequest(SECOND_CONNECTION_ID, REQUEST_ID, NOW)
    ).toBeUndefined()
    expect(
      store.openChatRequest(CONNECTION_ID, REQUEST_ID, NOW)
    ).toBeUndefined()
    expect(store.chatRun(CONNECTION_ID, REQUEST_ID, NOW)).toEqual(firstGrant)

    store.removeConnection(SECOND_CONNECTION_ID)
    expect(store.chatRun(CONNECTION_ID, REQUEST_ID, NOW)).toEqual(firstGrant)
    lease?.release()
  })

  it("rejects expired, wrong-thread, and incomplete private handoffs", () => {
    const store = new LiveConnectionGrantStore()
    const expired = authenticatedRequest(liveGrant("2026-07-21T23:59:59.000Z"))
    const incomplete = new Request(
      `https://agent.example.com/agents/issue-assistant/${THREAD_ID}`
    )

    expect(store.register(CONNECTION_ID, expired, THREAD_ID, NOW)).toBe(false)
    expect(
      store.register(CONNECTION_ID, authenticatedRequest(), "other-thread", NOW)
    ).toBe(false)
    expect(store.register(CONNECTION_ID, incomplete, THREAD_ID, NOW)).toBe(
      false
    )
  })

  it("does not bind malformed request identifiers", () => {
    const store = new LiveConnectionGrantStore()
    store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)

    expect(
      store.openChatRequest(CONNECTION_ID, "invalid id", NOW)
    ).toBeUndefined()
    expect(store.chatRun(CONNECTION_ID, "invalid id", NOW)).toBeUndefined()
  })
})
