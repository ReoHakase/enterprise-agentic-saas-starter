import { WorkerEntrypoint } from "cloudflare:workers"

import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "../adapters/control-plane/client"
import type { AgentRuntimeEnv } from "../composition/environment"
import { handleAgentRuntimeRequest } from "../runtime/run-agent"
import { SCRIPTED_MODEL_SENTINEL } from "../test-support/scripted-model"
import { scriptedMastra } from "./scripted-scenarios"

export { IssueAssistant } from "../legacy/issue-assistant"

const e2eDependencies = {
  captureFailure: () => undefined,
  createControlPlane: createAgentInternalGateway,
  mastra: scriptedMastra,
  requireModelCredential: false,
  toControlFailure: toAgentControlFailure,
} as const

class AgentRuntime extends WorkerEntrypoint<AgentRuntimeEnv> {
  fetch(request: Request): Promise<Response> | Response {
    return handleAgentRuntimeRequest(
      request,
      this.env,
      this.ctx,
      e2eDependencies
    )
  }
}

export { AgentRuntime }

const worker = {
  fetch: () =>
    new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "private, no-store",
        "content-type": "text/plain; charset=utf-8",
        "x-scripted-model": SCRIPTED_MODEL_SENTINEL,
      },
    }),
} satisfies ExportedHandler<AgentRuntimeEnv>

export default worker
