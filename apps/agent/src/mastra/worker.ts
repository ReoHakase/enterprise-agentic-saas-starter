import * as Sentry from "@sentry/cloudflare"
import { WorkerEntrypoint } from "cloudflare:workers"

import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "./adapters/control-plane/client"
import { captureAgentFailure } from "./adapters/telemetry/capture"
import { createAgentSentryOptions } from "./adapters/telemetry/privacy"
import type { AgentRuntimeEnv } from "./composition/environment"
import { mastra } from "./index"
import { handleAgentRuntimeRequest } from "./runtime/run-agent"

export { IssueAssistant } from "./legacy/issue-assistant"

const productionDependencies = {
  captureFailure: captureAgentFailure,
  createControlPlane: createAgentInternalGateway,
  mastra,
  requireModelCredential: true,
  toControlFailure: toAgentControlFailure,
} as const

class AgentRuntimeBase extends WorkerEntrypoint<AgentRuntimeEnv> {
  fetch(request: Request): Promise<Response> | Response {
    return handleAgentRuntimeRequest(
      request,
      this.env,
      this.ctx,
      productionDependencies
    )
  }
}

export const AgentRuntime = Sentry.withSentry(
  createAgentSentryOptions,
  AgentRuntimeBase
)

const worker = {
  fetch: () =>
    new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "private, no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    }),
} satisfies ExportedHandler<AgentRuntimeEnv>

export default Sentry.withSentry<AgentRuntimeEnv>(
  createAgentSentryOptions,
  worker
)
