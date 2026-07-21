import type { AgentConnection } from "@enterprise-agentic-saas/api/agent-client"

const GRANT_HEADER = "x-enterprise-agent-connection-grant"
const EXPIRES_AT_HEADER = "x-enterprise-agent-connection-expires-at"
const THREAD_ID_HEADER = "x-enterprise-agent-thread-id"

const INTERNAL_HEADERS = [GRANT_HEADER, EXPIRES_AT_HEADER, THREAD_ID_HEADER]

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

export const isLiveConnectionGrantActive = (
  connection: LiveConnectionGrant,
  now = Date.now()
): boolean => isActiveOpaqueGrant(connection.grant, connection.expiresAt, now)

export const withLiveConnectionGrant = (
  request: Request,
  connection: LiveConnectionGrant
): Request => {
  const url = new URL(request.url)
  url.search = ""

  const headers = new Headers(request.headers)
  for (const header of INTERNAL_HEADERS) headers.delete(header)
  headers.set(GRANT_HEADER, connection.grant)
  headers.set(EXPIRES_AT_HEADER, connection.expiresAt)
  headers.set(THREAD_ID_HEADER, connection.threadId)

  return new Request(url.toString(), new Request(request, { headers }))
}

export const readLiveConnectionGrant = (
  request: Request,
  expectedThreadId: string,
  now = Date.now()
): LiveConnectionGrant | undefined => {
  const grant = request.headers.get(GRANT_HEADER)
  const expiresAt = request.headers.get(EXPIRES_AT_HEADER)
  const threadId = request.headers.get(THREAD_ID_HEADER)

  if (
    grant === null ||
    expiresAt === null ||
    threadId !== expectedThreadId ||
    !OPAQUE_TOKEN_PATTERN.test(grant) ||
    !isCanonicalFutureTimestamp(expiresAt, now) ||
    !isIdentifier(threadId)
  ) {
    return undefined
  }

  return { expiresAt, grant, threadId }
}
