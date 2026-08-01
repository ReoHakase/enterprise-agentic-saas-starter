import { WorkerEntrypoint } from "cloudflare:workers"

import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "../adapters/control-plane/client"
import type { AgentRuntimeEnv } from "../composition/environment"
import { createAgentIsolateCompositionCache } from "../composition/isolate-composition"
import { handleAgentRuntimeRequest } from "../runtime/run-agent"
import { SCRIPTED_MODEL_SENTINEL } from "../test-support/scripted-model"
import { createScriptedAgentRuntimeComposition } from "./scripted-runtime-composition"

export { IssueAssistant } from "../legacy/issue-assistant"

const getScriptedAgentIsolateComposition = createAgentIsolateCompositionCache(
  createScriptedAgentRuntimeComposition
)

class AgentRuntime extends WorkerEntrypoint<AgentRuntimeEnv> {
  fetch(request: Request): Promise<Response> | Response {
    const composition = getScriptedAgentIsolateComposition(this.env)
    return handleAgentRuntimeRequest(request, this.env, this.ctx, {
      captureFailure: () => undefined,
      createControlPlane: createAgentInternalGateway,
      executionRegistry: composition.executionRegistry,
      createApprovalResumeRuntime: composition.createApprovalResumeRuntime,
      mastra: composition.mastra,
      requireModelCredential: false,
      toControlFailure: toAgentControlFailure,
    })
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
