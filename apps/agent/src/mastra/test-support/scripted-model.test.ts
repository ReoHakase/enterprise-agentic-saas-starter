import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/agent-contracts"
import { RequestContext } from "@mastra/core/request-context"
import { describe, expect, it } from "vitest"

import {
  createAgentInternalGateway,
  type AgentInternalGateway,
} from "../adapters/control-plane/client"
import { createProductAgent } from "../agents/product-agent"
import { createPublicWebResearchAgent } from "../agents/public-web-research-agent"
import { createAgentToolBudget } from "../core/budget/tool"
import { createAgentVisionBudget } from "../core/budget/vision"
import type { ProductAgentRequestContext } from "../runtime/request-context"
import { createRunSettlement } from "../runtime/settlement"
import { createWebSearchTool } from "../tools/web-search/tool"
import { createScriptedModel, SCRIPTED_MODEL_SENTINEL } from "./scripted-model"

const createRuntimeContext = (
  api: AgentInternalGateway
): RequestContext<ProductAgentRequestContext> => {
  const requestContext = new RequestContext<ProductAgentRequestContext>()
  requestContext.set("runtime", {
    api,
    budget: createAgentToolBudget(),
    openRouterApiKey: "",
    rootRunId: "run_scripted",
    runGrant: "grant_scripted",
    settlement: createRunSettlement(api, "grant_scripted"),
    timezone: "Asia/Tokyo",
    visionBudget: createAgentVisionBudget(),
    visionEnabled: false,
    writesEnabled: false,
  })
  return requestContext
}

describe("standard scripted model", () => {
  it("drives the real Agent factory, schema, and read executor in order", async () => {
    const calls: unknown[] = []
    const binding: AgentInternalFetchBinding = {
      fetch: async (input, init) => {
        const request = new Request(input, init)
        calls.push(request.headers.get("authorization"))
        return Response.json({
          name: "Scripted User",
          profileImage: null,
        })
      },
    }
    const api = createAgentInternalGateway(binding)
    const productModel = createScriptedModel([
      {
        finishReason: "tool-calls",
        parts: [
          {
            type: "tool-call",
            input: {},
            toolCallId: "call_read_account",
            toolName: "read_account_context",
          },
        ],
      },
      {
        parts: [{ type: "text", text: "Account context was read." }],
        usage: { inputTokens: 12, outputTokens: 5 },
      },
    ])
    const researchAgent = createPublicWebResearchAgent({
      model: createScriptedModel(
        [{ parts: [{ type: "text", text: "unused" }] }],
        { repeat: true }
      ),
      tools: {},
    })
    const agent = createProductAgent({
      model: productModel,
      webSearchTool: createWebSearchTool(researchAgent),
    })

    const result = await agent.generate("Read my account context.", {
      maxSteps: 2,
      requestContext: createRuntimeContext(api),
    })

    expect(result.text).toBe("Account context was read.")
    expect(calls).toEqual(["Bearer grant_scripted"])
    expect(productModel.doGenerateCalls).toHaveLength(2)
    expect(productModel.modelId).toContain(SCRIPTED_MODEL_SENTINEL)
  })

  it("exposes explicit malformed stream chunks and honors abort during delay", async () => {
    const malformed = { privateFixturePart: true }
    const model = createScriptedModel([
      {
        parts: [],
        stream: [{ value: malformed }],
      },
      {
        delayMs: 10_000,
        parts: [{ type: "text", text: "too late" }],
      },
    ])
    const streamOptions: Parameters<typeof model.doStream>[0] = { prompt: [] }
    const streamed = await model.doStream(streamOptions)
    const chunks = await Array.fromAsync(streamed.stream)
    expect(chunks).toEqual([malformed])

    const abort = new AbortController()
    const generateOptions: Parameters<typeof model.doGenerate>[0] = {
      abortSignal: abort.signal,
      prompt: [],
    }
    const pending = model.doGenerate(generateOptions)
    abort.abort(new DOMException("Stopped", "AbortError"))
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })
})
