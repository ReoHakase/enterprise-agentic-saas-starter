import * as Sentry from "@sentry/cloudflare"
import { routeAgentRequest } from "agents"

import {
  handleConnectionRequest,
  type AgentRequestRouter,
} from "./connection-request"
import type { AgentRuntimeEnv } from "./environment"
import { IssueAssistantBase } from "./issue-assistant"
import { createAgentSentryOptions } from "./observability"

export const IssueAssistant = Sentry.instrumentDurableObjectWithSentry(
  (environment: AgentRuntimeEnv) => createAgentSentryOptions(environment),
  IssueAssistantBase
)

const routeRequest: AgentRequestRouter<AgentRuntimeEnv> = (
  request,
  environment,
  options
) =>
  routeAgentRequest(request, environment, {
    onBeforeConnect: options.onBeforeConnect,
    routingRetry: false,
  })

const worker = {
  fetch: (request, environment) =>
    handleConnectionRequest(request, environment, routeRequest),
} satisfies ExportedHandler<AgentRuntimeEnv>

export default Sentry.withSentry<AgentRuntimeEnv>(
  createAgentSentryOptions,
  worker
)
