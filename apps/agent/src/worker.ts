import { routeAgentRequest } from "agents"

import {
  handleConnectionRequest,
  type AgentRequestRouter,
} from "./connection-request"
import type { AgentRuntimeEnv } from "./environment"

export { IssueAssistant } from "./issue-assistant"

const routeRequest: AgentRequestRouter<AgentRuntimeEnv> = (
  request,
  environment,
  options
) =>
  routeAgentRequest(request, environment, {
    onBeforeConnect: options.onBeforeConnect,
    routingRetry: false,
  })

export default {
  fetch: (request, environment) =>
    handleConnectionRequest(request, environment, routeRequest),
} satisfies ExportedHandler<AgentRuntimeEnv>
