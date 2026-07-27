import { WorkerEntrypoint } from "cloudflare:workers"

import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "../adapters/control-plane/client"
import type { AgentRuntimeEnv } from "../composition/environment"
import { handleAgentRuntimeRequest } from "../runtime/run-agent"
import { SCRIPTED_MODEL_SENTINEL } from "../test-support/scripted-model"
import { createScriptedAgentRuntimeComposition } from "./scripted-runtime-composition"

export { IssueAssistant } from "../legacy/issue-assistant"

class AgentRuntime extends WorkerEntrypoint<AgentRuntimeEnv> {
  #composition?: ReturnType<typeof createScriptedAgentRuntimeComposition>

  fetch(request: Request): Promise<Response> | Response {
    this.#composition ??= createScriptedAgentRuntimeComposition(this.env)
    const composition = this.#composition
    return handleAgentRuntimeRequest(request, this.env, this.ctx, {
      captureFailure: () => undefined,
      createControlPlane: createAgentInternalGateway,
      approvedIssueActionExecutionRegistry:
        composition.approvedIssueActionExecutionRegistry,
      executionRegistry: composition.executionRegistry,
      mastra: composition.mastra,
      requireModelCredential: false,
      threadTitleAgent: composition.threadTitleAgent,
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
