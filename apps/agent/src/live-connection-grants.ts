import type { WSMessage } from "agents"

import {
  isLiveConnectionGrantActive,
  readLiveConnectionGrant,
  type LiveConnectionGrant,
} from "./connection-grant"

const CHAT_REQUEST_TYPE = "cf_agent_use_chat_request"
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const chatRequestId = (message: WSMessage): string | undefined => {
  if (typeof message !== "string") return undefined

  try {
    const parsed: unknown = JSON.parse(message)
    if (parsed === null || typeof parsed !== "object") return undefined
    const type: unknown = Reflect.get(parsed, "type")
    const id: unknown = Reflect.get(parsed, "id")
    return type === CHAT_REQUEST_TYPE &&
      typeof id === "string" &&
      REQUEST_ID_PATTERN.test(id)
      ? id
      : undefined
  } catch {
    return undefined
  }
}

export class LiveConnectionGrantStore {
  readonly #connections = new Map<string, LiveConnectionGrant>()
  readonly #requests = new Map<string, LiveConnectionGrant>()

  register(
    connectionId: string,
    request: Request,
    expectedThreadId: string,
    now = Date.now()
  ): boolean {
    const connection = readLiveConnectionGrant(request, expectedThreadId, now)
    if (connection === undefined) return false
    this.#connections.set(connectionId, connection)
    return true
  }

  connection(
    connectionId: string,
    now = Date.now()
  ): LiveConnectionGrant | undefined {
    const connection = this.#connections.get(connectionId)
    if (
      connection === undefined ||
      !isLiveConnectionGrantActive(connection, now)
    ) {
      this.removeConnection(connectionId)
      return undefined
    }
    return connection
  }

  bindChatRequest(
    connectionId: string,
    message: WSMessage,
    now = Date.now()
  ): string | undefined {
    const connection = this.connection(connectionId, now)
    const requestId = chatRequestId(message)
    if (connection === undefined || requestId === undefined) return undefined
    this.#requests.set(requestId, connection)
    return requestId
  }

  request(
    requestId: string,
    now = Date.now()
  ): LiveConnectionGrant | undefined {
    const connection = this.#requests.get(requestId)
    if (
      connection === undefined ||
      !isLiveConnectionGrantActive(connection, now)
    ) {
      this.#requests.delete(requestId)
      return undefined
    }
    return connection
  }

  releaseRequest(requestId: string): void {
    this.#requests.delete(requestId)
  }

  removeConnection(connectionId: string): void {
    const connection = this.#connections.get(connectionId)
    this.#connections.delete(connectionId)
    if (connection === undefined) return
    for (const [requestId, requestConnection] of this.#requests) {
      if (requestConnection === connection) this.#requests.delete(requestId)
    }
  }
}
