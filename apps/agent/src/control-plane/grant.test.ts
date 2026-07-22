import type { AgentConnection } from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it } from "vitest"

import { isActiveOpaqueGrant, toLiveConnectionGrant } from "./grant"

const NOW = Date.parse("2026-07-22T00:00:00.000Z")
const GRANT = "grant_0123456789abcdefghijklmnopqrstuvwxyz"

const connection = (): AgentConnection => ({
  grant: GRANT,
  expiresAt: "2026-07-22T00:01:00.000Z",
  user: { name: "User", profileImage: null },
  organization: {
    name: "Organization",
    slug: "organization",
    role: "member",
    permissions: {
      canReadIssues: true,
      canCreateIssues: true,
      canUpdateIssues: true,
      canDeleteOwnIssues: true,
      canDeleteAnyIssue: false,
    },
  },
  thread: { id: "thread_1", title: "Thread" },
})

describe("private connection grants", () => {
  it("accepts only canonical future opaque grants", () => {
    expect(isActiveOpaqueGrant(GRANT, connection().expiresAt, NOW)).toBe(true)
    expect(isActiveOpaqueGrant("short", connection().expiresAt, NOW)).toBe(
      false
    )
    expect(isActiveOpaqueGrant(GRANT, "2026-07-21T23:59:00.000Z", NOW)).toBe(
      false
    )
    expect(isActiveOpaqueGrant(GRANT, "not-a-date", NOW)).toBe(false)
    expect(isActiveOpaqueGrant(GRANT, "2026-07-22T00:01:00Z", NOW)).toBe(false)
  })

  it("binds the capability to the exact valid thread", () => {
    expect(toLiveConnectionGrant(connection(), "thread_1", NOW)).toEqual({
      grant: GRANT,
      expiresAt: "2026-07-22T00:01:00.000Z",
      threadId: "thread_1",
    })
    expect(toLiveConnectionGrant(connection(), "thread_2", NOW)).toBeUndefined()
    const invalid = connection()
    invalid.thread.id = "invalid/thread"
    expect(
      toLiveConnectionGrant(invalid, "invalid/thread", NOW)
    ).toBeUndefined()
  })
})
