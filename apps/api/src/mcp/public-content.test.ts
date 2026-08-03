import type { MCPRequestHandlerExtra } from "@mastra/mcp"
import { describe, expect, it } from "vitest"

import { publicMcpPrompts } from "./prompts/public"
import { publicMcpResources } from "./resources/public"

const forbiddenPublicMaterial = [
  /\.agents/iu,
  /AGENTS\.md/iu,
  /apps\/agent/iu,
  /service binding/iu,
  /system (?:instruction|prompt)/iu,
  /\/internal(?:\/|\b)/iu,
  /tool routing/iu,
]

const requestExtra: MCPRequestHandlerExtra = {
  requestId: "public-content-test",
  signal: new AbortController().signal,
  sendNotification: async () => {},
  sendRequest: async () => {
    throw new Error("Public content tests do not send MCP requests")
  },
}

const expectPublicProjection = (value: unknown) => {
  const serialized = JSON.stringify(value)
  for (const pattern of forbiddenPublicMaterial) {
    expect(serialized).not.toMatch(pattern)
  }
}

describe("public MCP prompts and resources", () => {
  it("publishes one bounded external workflow prompt", async () => {
    const prompts = await publicMcpPrompts.listPrompts({ extra: requestExtra })
    const messages = await publicMcpPrompts.getPromptMessages?.({
      name: "triage_issue",
      args: { request: "Create an Issue for the billing regression." },
      extra: requestExtra,
    })

    expect(prompts).toEqual([
      expect.objectContaining({
        name: "triage_issue",
        arguments: [expect.objectContaining({ name: "request" })],
      }),
    ])
    expect(messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: expect.objectContaining({ type: "text" }),
      }),
    ])
    expectPublicProjection({ prompts, messages })
  })

  it("publishes only fixed read-only guides", async () => {
    const resources = await publicMcpResources.listResources({
      extra: requestExtra,
    })
    const contents = await Promise.all(
      resources.map(({ uri }) =>
        publicMcpResources.getResourceContent({ uri, extra: requestExtra })
      )
    )

    expect(resources.map(({ uri }) => uri)).toEqual([
      "guide://enterprise-agentic-saas/issues",
      "guide://enterprise-agentic-saas/attachments",
    ])
    expect(contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.any(String) }),
      ])
    )
    expectPublicProjection({ resources, contents })
  })

  it("rejects unknown and malformed requests without adding fallback tools", async () => {
    await expect(
      publicMcpPrompts.getPromptMessages?.({
        name: "missing",
        args: { request: "test" },
        extra: requestExtra,
      })
    ).rejects.toThrow("Public prompt not found")
    await expect(
      publicMcpResources.getResourceContent({
        uri: "guide://enterprise-agentic-saas/missing",
        extra: requestExtra,
      })
    ).rejects.toThrow("Public guide not found")
  })
})
