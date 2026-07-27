import { withSentry } from "@sentry/cloudflare"
import { WorkerEntrypoint } from "cloudflare:workers"

import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "./adapters/control-plane/client"
import { captureAgentFailure } from "./adapters/telemetry/capture"
import { createAgentSentryOptions } from "./adapters/telemetry/privacy"
import type { AgentRuntimeEnv } from "./composition/environment"
import { getAgentIsolateComposition } from "./composition/isolate-composition"
import { handleAgentRuntimeRequest } from "./runtime/run-agent"

export { IssueAssistant } from "./legacy/issue-assistant"

class AgentRuntimeBase extends WorkerEntrypoint<AgentRuntimeEnv> {
  fetch(request: Request): Promise<Response> | Response {
    const composition = getAgentIsolateComposition(this.env)
    return handleAgentRuntimeRequest(request, this.env, this.ctx, {
      captureFailure: captureAgentFailure,
      createControlPlane: createAgentInternalGateway,
      approvedIssueActionExecutionRegistry:
        composition.approvedIssueActionExecutionRegistry,
      executionRegistry: composition.executionRegistry,
      mastra: composition.mastra,
      requireModelCredential: true,
      threadTitleAgent: composition.threadTitleAgent,
      toControlFailure: toAgentControlFailure,
    })
  }
}

export const AgentRuntime = withSentry(
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

export default withSentry<AgentRuntimeEnv>(createAgentSentryOptions, worker)
