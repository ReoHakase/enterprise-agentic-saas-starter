import { describe, expect, it } from "vitest"

import {
  assertAgentMaintenanceBindingEnabled,
  assertAgentRuntimeBindingAbsent,
  assertFinalAgentBindings,
  assertImagePreviewBinding,
  parseWorkerBindingInventory,
} from "./worker-binding-policy"

describe("Worker binding inventory policyの契約", () => {
  it("AGENT_RUNTIMEなしの有効なcompatibility API inventoryを受け入れる", () => {
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

  it("最終APIでruntime bindingと無効maintenanceを要求する", () => {
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
    ["欠損", []],
    [
      "plain text指定",
      [{ name: "AGENT_RUNTIME", text: "x", type: "plain_text" }],
    ],
    [
      "誤service",
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
      "誤entrypoint",
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
      "重複",
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
  ])("%sの最終runtime bindingを拒否する", (_name, runtimeBindings) => {
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

  it("compatibility runtime bindingと不正Cloudflare responseを拒否する", () => {
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
    { inventory: [], name: "欠損" },
    {
      inventory: [
        {
          name: "IMAGE_PREVIEWS",
          service: "wrong-images",
          type: "service",
        },
      ],
      name: "誤service",
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
      name: "custom entrypoint指定",
    },
  ])("不正なprivate Images bindingを拒否する: $name", ({ inventory }) => {
    expect(() => assertImagePreviewBinding(inventory)).toThrow(
      "expected IMAGE_PREVIEWS"
    )
  })
})
