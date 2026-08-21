import { describe, expect, it } from "vitest"

import {
  assertAgentMaintenanceBindingEnabled,
  assertAgentRuntimeBindingAbsent,
  assertFinalAgentBindings,
  assertImagePreviewBinding,
  parseWorkerBindingInventory,
} from "./worker-binding-policy"

describe("Worker binding inventory policy", () => {
  it("accepts a valid compatibility API inventory without AGENT_RUNTIME", () => {
    const inventory = parseWorkerBindingInventory({
      success: true,
      result: {
        bindings: [
          { name: "FILES", type: "r2_bucket" },
          { name: "IMAGES", type: "images" },
          {
            name: "IMAGE_PREVIEWS",
            service: "enterprise-agentic-saas-images",
            type: "service",
          },
          {
            name: "AGENT_MAINTENANCE_MODE",
            type: "plain_text",
            text: "1",
          },
        ],
      },
    })

    expect(inventory).toEqual([
      { name: "FILES", type: "r2_bucket" },
      { name: "IMAGES", type: "images" },
      {
        name: "IMAGE_PREVIEWS",
        service: "enterprise-agentic-saas-images",
        type: "service",
      },
      {
        name: "AGENT_MAINTENANCE_MODE",
        type: "plain_text",
        text: "1",
      },
    ])
    expect(() => assertAgentRuntimeBindingAbsent(inventory)).not.toThrow()
    expect(() => assertAgentMaintenanceBindingEnabled(inventory)).not.toThrow()
    expect(() => assertImagePreviewBinding(inventory)).not.toThrow()
  })

  it("requires the runtime binding and disabled maintenance in the final API", () => {
    expect(() =>
      assertFinalAgentBindings([
        {
          entrypoint: "AgentRuntime",
          name: "AGENT_RUNTIME",
          service: "enterprise-agentic-saas-agent",
          type: "service",
        },
        {
          name: "AGENT_MAINTENANCE_MODE",
          type: "plain_text",
          text: "0",
        },
      ])
    ).not.toThrow()
    expect(() =>
      assertFinalAgentBindings([
        {
          name: "AGENT_MAINTENANCE_MODE",
          type: "plain_text",
          text: "0",
        },
      ])
    ).toThrow("expected AGENT_RUNTIME")
  })

  it.each([
    ["missing", []],
    ["plain text", [{ name: "AGENT_RUNTIME", text: "x", type: "plain_text" }]],
    [
      "wrong service",
      [
        {
          entrypoint: "AgentRuntime",
          name: "AGENT_RUNTIME",
          service: "wrong-agent",
          type: "service",
        },
      ],
    ],
    [
      "wrong entrypoint",
      [
        {
          entrypoint: "WrongRuntime",
          name: "AGENT_RUNTIME",
          service: "enterprise-agentic-saas-agent",
          type: "service",
        },
      ],
    ],
    [
      "duplicate",
      [
        {
          entrypoint: "AgentRuntime",
          name: "AGENT_RUNTIME",
          service: "enterprise-agentic-saas-agent",
          type: "service",
        },
        {
          entrypoint: "AgentRuntime",
          name: "AGENT_RUNTIME",
          service: "enterprise-agentic-saas-agent",
          type: "service",
        },
      ],
    ],
  ])("rejects a %s final runtime binding", (_name, runtimeBindings) => {
    expect(() =>
      assertFinalAgentBindings([
        ...runtimeBindings,
        {
          name: "AGENT_MAINTENANCE_MODE",
          text: "0",
          type: "plain_text",
        },
      ])
    ).toThrow("expected AGENT_RUNTIME")
  })

  it("rejects compatibility runtime bindings and malformed Cloudflare responses", () => {
    expect(() =>
      assertAgentRuntimeBindingAbsent([
        { name: "FILES" },
        { name: "AGENT_RUNTIME" },
      ])
    ).toThrow("still exposes AGENT_RUNTIME")
    expect(() =>
      assertAgentMaintenanceBindingEnabled([
        {
          name: "AGENT_MAINTENANCE_MODE",
          type: "plain_text",
          text: "0",
        },
      ])
    ).toThrow("not enabled")
    expect(() =>
      parseWorkerBindingInventory({ success: false, result: { bindings: [] } })
    ).toThrow("inventory is invalid")
    expect(() =>
      parseWorkerBindingInventory({
        success: true,
        result: { bindings: [{}] },
      })
    ).toThrow("entry is invalid")
  })

  it.each([
    { inventory: [], name: "missing" },
    {
      inventory: [
        {
          name: "IMAGE_PREVIEWS",
          service: "wrong-images",
          type: "service",
        },
      ],
      name: "wrong service",
    },
    {
      inventory: [
        {
          entrypoint: "ImagesEntrypoint",
          name: "IMAGE_PREVIEWS",
          service: "enterprise-agentic-saas-images",
          type: "service",
        },
      ],
      name: "custom entrypoint",
    },
  ])("rejects an invalid private Images binding: $name", ({ inventory }) => {
    expect(() => assertImagePreviewBinding(inventory)).toThrow(
      "expected IMAGE_PREVIEWS"
    )
  })
})
