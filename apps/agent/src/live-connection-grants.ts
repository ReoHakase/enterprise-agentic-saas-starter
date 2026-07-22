import {
  isLiveConnectionGrantActive,
  readLiveConnectionGrant,
  type LiveConnectionGrant,
} from "./connection-grant"

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

type BoundRequest = {
  connectionId: string
  grant: LiveConnectionGrant
}

export type LiveChatRequestLease = {
  grant: LiveConnectionGrant
  release: () => void
  requestId: string
}

export class LiveConnectionGrantStore {
  readonly #connections = new Map<string, LiveConnectionGrant>()
  readonly #requests = new Map<string, BoundRequest>()

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

  openChatRequest(
    connectionId: string,
    requestId: string,
    now = Date.now()
  ): LiveChatRequestLease | undefined {
    const connection = this.connection(connectionId, now)
    if (connection === undefined || !REQUEST_ID_PATTERN.test(requestId)) {
      return undefined
    }
    const existing = this.#requests.get(requestId)
    if (
      existing !== undefined &&
      isLiveConnectionGrantActive(existing.grant, now)
    ) {
      return undefined
    }
    const request = { connectionId, grant: connection }
    this.#requests.set(requestId, request)

    let released = false
    return {
      grant: connection,
      release: () => {
        if (released) return
        released = true
        if (this.#requests.get(requestId) === request) {
          this.#requests.delete(requestId)
        }
      },
      requestId,
    }
  }

  chatRun(
    connectionId: string,
    requestId: string,
    now = Date.now()
  ): LiveConnectionGrant | undefined {
    if (!REQUEST_ID_PATTERN.test(requestId)) return undefined

    const connection = this.connection(connectionId, now)
    if (connection === undefined) return undefined

    const request = this.#requests.get(requestId)
    return request?.connectionId === connectionId &&
      request.grant === connection
      ? connection
      : undefined
  }

  removeConnection(connectionId: string): void {
    this.#connections.delete(connectionId)
    for (const [requestId, request] of this.#requests) {
      if (request.connectionId === connectionId)
        this.#requests.delete(requestId)
    }
  }
}
