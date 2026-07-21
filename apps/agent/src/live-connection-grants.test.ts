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

const chatRequest = (id = REQUEST_ID): string =>
  JSON.stringify({
    id,
    init: { body: "{}", method: "POST" },
    type: "cf_agent_use_chat_request",
  })

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

    expect(store.bindChatRequest(CONNECTION_ID, chatRequest(), NOW)).toBe(
      REQUEST_ID
    )
    expect(store.request(REQUEST_ID, NOW)).toEqual(liveGrant())
    expect(JSON.stringify(store)).toBe("{}")
    expect(JSON.stringify(store)).not.toContain(liveGrant().grant)

    store.releaseRequest(REQUEST_ID)
    expect(store.request(REQUEST_ID, NOW)).toBeUndefined()
  })

  it("has no grant after a simulated isolate wake and requires reconnect", () => {
    const beforeWake = new LiveConnectionGrantStore()
    expect(
      beforeWake.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    ).toBe(true)

    const afterWake = new LiveConnectionGrantStore()
    expect(afterWake.connection(CONNECTION_ID, NOW)).toBeUndefined()
    expect(
      afterWake.bindChatRequest(CONNECTION_ID, chatRequest(), NOW)
    ).toBeUndefined()
  })

  it("removes request grants when their live connection closes", () => {
    const store = new LiveConnectionGrantStore()
    store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)
    store.bindChatRequest(CONNECTION_ID, chatRequest(), NOW)

    store.removeConnection(CONNECTION_ID)

    expect(store.connection(CONNECTION_ID, NOW)).toBeUndefined()
    expect(store.request(REQUEST_ID, NOW)).toBeUndefined()
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

  it("does not bind malformed or unrelated protocol messages", () => {
    const store = new LiveConnectionGrantStore()
    store.register(CONNECTION_ID, authenticatedRequest(), THREAD_ID, NOW)

    expect(
      store.bindChatRequest(CONNECTION_ID, "not-json", NOW)
    ).toBeUndefined()
    expect(
      store.bindChatRequest(
        CONNECTION_ID,
        JSON.stringify({ id: REQUEST_ID, type: "cf_agent_chat_clear" }),
        NOW
      )
    ).toBeUndefined()
    expect(
      store.bindChatRequest(CONNECTION_ID, chatRequest("invalid id"), NOW)
    ).toBeUndefined()
  })
})
