import type { AgentInternalApiContract } from "@enterprise-agentic-saas/api/agent-client"

import {
  toLiveConnectionGrant,
  withLiveConnectionGrant,
} from "./connection-grant"

const AGENT_CLASS_NAME = "IssueAssistant"
const AGENT_PATH_PATTERN = /^\/agents\/issue-assistant\/([A-Za-z0-9_-]{1,128})$/
const TICKET_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/

type ConnectionTicketConsumer = Pick<
  AgentInternalApiContract,
  "consumeConnectionTicket"
>

export type ConnectionRequestEnvironment = {
  AGENT_INTERNAL_API: ConnectionTicketConsumer
  WEB_ORIGIN: string
}

export type AgentLobby = {
  className: string
  name: string
}

type BeforeConnect = (
  request: Request,
  lobby: AgentLobby
) => Promise<Request | Response | undefined> | Request | Response | undefined

export type AgentRequestRouter<Environment> = (
  request: Request,
  environment: Environment,
  options: { onBeforeConnect: BeforeConnect }
) => Promise<Response | null>

type ValidConnectionRequest = {
  origin: string
  threadId: string
  ticket: string
}

const fixedResponse = (
  status: number,
  body: string,
  headers?: HeadersInit
): Response =>
  new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    },
  })

const notFound = (): Response => fixedResponse(404, "Not Found")
const unauthorized = (): Response => fixedResponse(401, "Connection rejected")

const configuredOrigin = (value: string): string | undefined => {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.origin !== value) return undefined
    return url.origin
  } catch {
    return undefined
  }
}

const validateConnectionRequest = (
  request: Request,
  allowedOriginValue: string
): ValidConnectionRequest | Response => {
  if (request.method !== "GET") {
    return fixedResponse(405, "Method Not Allowed", { allow: "GET" })
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return fixedResponse(426, "Upgrade Required", { upgrade: "websocket" })
  }

  const url = new URL(request.url)
  const pathMatch = AGENT_PATH_PATTERN.exec(url.pathname)
  if (!pathMatch?.[1]) return notFound()

  const allowedOrigin = configuredOrigin(allowedOriginValue)
  const requestOrigin = request.headers.get("origin")
  if (allowedOrigin === undefined || requestOrigin !== allowedOrigin) {
    return unauthorized()
  }

  const tickets = url.searchParams.getAll("ticket")
  const queryEntries = Array.from(url.searchParams)
  const ticket = tickets[0]
  if (
    queryEntries.length !== 1 ||
    tickets.length !== 1 ||
    ticket === undefined ||
    !TICKET_PATTERN.test(ticket)
  ) {
    return unauthorized()
  }

  return { origin: requestOrigin, threadId: pathMatch[1], ticket }
}

export const handleConnectionRequest = async <
  Environment extends ConnectionRequestEnvironment,
>(
  request: Request,
  environment: Environment,
  routeRequest: AgentRequestRouter<Environment>
): Promise<Response> => {
  const validated = validateConnectionRequest(request, environment.WEB_ORIGIN)
  if (validated instanceof Response) return validated

  const routed = await routeRequest(request, environment, {
    onBeforeConnect: async (connectRequest, lobby) => {
      if (
        lobby.className !== AGENT_CLASS_NAME ||
        lobby.name !== validated.threadId
      ) {
        return notFound()
      }

      try {
        const connection =
          await environment.AGENT_INTERNAL_API.consumeConnectionTicket({
            threadId: validated.threadId,
            ticket: validated.ticket,
          })
        const liveGrant = toLiveConnectionGrant(connection, validated.threadId)
        return liveGrant === undefined
          ? unauthorized()
          : withLiveConnectionGrant(connectRequest, liveGrant)
      } catch {
        return unauthorized()
      }
    },
  })

  return routed ?? notFound()
}
