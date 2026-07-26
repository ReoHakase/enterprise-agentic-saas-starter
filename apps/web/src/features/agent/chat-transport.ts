import { DefaultChatTransport } from "ai"

import { prepareAgentChatBody } from "./chat-request-body"
import type { AgentChatMessage } from "./schema"

const agentChatUrl = (baseUrl: string) => {
  const url = new URL(baseUrl)
  const basePath = url.pathname.replace(/\/$/u, "")
  url.pathname = `${basePath}/agent/chat`
  url.search = ""
  url.hash = ""
  return url.toString()
}

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const createAgentChatTransport = (input: {
  apiBaseUrl: string
  threadId: string
  getTimezone?: () => string
}) =>
  new DefaultChatTransport<AgentChatMessage>({
    api: agentChatUrl(input.apiBaseUrl),
    credentials: "include",
    prepareSendMessagesRequest: ({ messages }) => ({
      credentials: "include",
      body: prepareAgentChatBody({
        threadId: input.threadId,
        messages,
        timezone: (input.getTimezone ?? browserTimezone)(),
      }),
    }),
  })
