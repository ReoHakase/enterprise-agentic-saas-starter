import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/agent-contracts"
import { RequestContext } from "@mastra/core/request-context"
import { Memory } from "@mastra/memory"
import { describe, expect, it } from "vitest"

import {
  createAgentInternalGateway,
  type AgentInternalGateway,
} from "../adapters/control-plane/client"
import { createProductAgent } from "../agents/product-agent"
import { createAgentToolBudget } from "../core/budget/tool"
import { createAgentVisionBudget } from "../core/budget/vision"
import type { ProductAgentRequestContext } from "../runtime/request-context"
import { ProductAgentExecutionRegistry } from "../runtime/request-context"
import { createRunSettlement } from "../runtime/settlement"
import { createAgentStorage } from "../storage"
import { createWebSearchTool } from "../tools/web-search/tool"
import { createScriptedModel, SCRIPTED_MODEL_SENTINEL } from "./scripted-model"

const createRuntimeContext = (
  api: AgentInternalGateway,
  executionRegistry: ProductAgentExecutionRegistry
): RequestContext<ProductAgentRequestContext> => {
  const requestContext = new RequestContext<ProductAgentRequestContext>()
  const execution = executionRegistry.register({
    api,
    budget: createAgentToolBudget(),
    onRevoked: () => undefined,
    rootRunId: "run_scripted",
    runGrant: "grant_scripted",
    settlement: createRunSettlement(api, "grant_scripted"),
    suspendAction: async () => undefined,
    visionBudget: createAgentVisionBudget(),
  })
  requestContext.set("runtime", {
    executionId: execution.executionId,
    modelRoute: "product",
    policy: {
      currentMessageHasAssets: false,
      reusableThreadAssetsAvailable: false,
      timezone: "Asia/Tokyo",
      visionEnabled: false,
      writesEnabled: false,
    },
    resourceId: "resource_scripted",
    threadId: "thread_scripted",
  })
  return requestContext
}

describe("standard scripted model", () => {
  it("only resolves an unscoped model when Studio access is explicitly enabled", async () => {
    const executionRegistry = new ProductAgentExecutionRegistry()
    const createAgent = (allowUnscopedModel: boolean) =>
      createProductAgent({
        allowUnscopedModel,
        memory: new Memory({
          storage: createAgentStorage(
            { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
            `studio-model-${allowUnscopedModel}`
          ),
        }),
        model: createScriptedModel([
          { parts: [{ type: "text", text: "STUDIO_OK" }] },
        ]),
        resolveExecution: executionRegistry.resolve,
        webSearchTool: createWebSearchTool(
          async () => ({ finishReason: "stop", sources: [], text: "unused" }),
          executionRegistry.resolve
        ),
      })

    const productionAgent = createAgent(false)
    const studioAgent = createAgent(true)

    await expect(productionAgent.getModel()).rejects.toThrow(
      "Agent runtime capability is unavailable"
    )
    await expect(studioAgent.getModel()).resolves.toMatchObject({
      modelId: expect.stringContaining(SCRIPTED_MODEL_SENTINEL),
      provider: "scripted",
    })
    expect(studioAgent.listTools()).toEqual({})
  })

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
    const executionRegistry = new ProductAgentExecutionRegistry()
    const agent = createProductAgent({
      memory: new Memory({
        storage: createAgentStorage(
          { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
          "scripted-model-test"
        ),
      }),
      model: productModel,
      resolveExecution: executionRegistry.resolve,
      webSearchTool: createWebSearchTool(
        async () => ({ finishReason: "stop", sources: [], text: "unused" }),
        executionRegistry.resolve
      ),
    })

    const result = await agent.generate("Read my account context.", {
      maxSteps: 2,
      requestContext: createRuntimeContext(api, executionRegistry),
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

  it("resolves a step from the current call options without shared cursor state", async () => {
    const model = createScriptedModel((options) => ({
      parts: [
        {
          type: "text",
          text: JSON.stringify(options.prompt).includes("[E1:SECOND]")
            ? "second"
            : "first",
        },
      ],
    }))

    const first = await model.doGenerate({
      prompt: [
        { role: "user", content: [{ type: "text", text: "[E1:FIRST]" }] },
      ],
    })
    const second = await model.doGenerate({
      prompt: [
        { role: "user", content: [{ type: "text", text: "[E1:SECOND]" }] },
      ],
    })

    expect(first.content).toContainEqual({ type: "text", text: "first" })
    expect(second.content).toContainEqual({ type: "text", text: "second" })
  })
})
