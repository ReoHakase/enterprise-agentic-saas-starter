import type { AgentConnection } from "@enterprise-agentic-saas/api/agent-client"

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export type LiveConnectionGrant = {
  grant: string
  expiresAt: string
  threadId: string
}

const isCanonicalFutureTimestamp = (value: string, now: number): boolean => {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp <= now) return false
  return new Date(timestamp).toISOString() === value
}

const isIdentifier = (value: string): boolean => IDENTIFIER_PATTERN.test(value)

export const isActiveOpaqueGrant = (
  grant: string,
  expiresAt: string,
  now = Date.now()
): boolean =>
  OPAQUE_TOKEN_PATTERN.test(grant) && isCanonicalFutureTimestamp(expiresAt, now)

export const toLiveConnectionGrant = (
  connection: AgentConnection,
  expectedThreadId: string,
  now = Date.now()
): LiveConnectionGrant | undefined => {
  if (
    connection.thread.id !== expectedThreadId ||
    !isActiveOpaqueGrant(connection.grant, connection.expiresAt, now) ||
    !isIdentifier(connection.thread.id)
  ) {
    return undefined
  }

  return {
    expiresAt: connection.expiresAt,
    grant: connection.grant,
    threadId: connection.thread.id,
  }
}
