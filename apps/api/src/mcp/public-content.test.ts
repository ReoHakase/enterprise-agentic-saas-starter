import type { MCPRequestHandlerExtra } from "@mastra/mcp"
import { describe, expect, it } from "vitest"

import { publicMcpPrompts } from "./prompts/public"
import { publicMcpResources } from "./resources/public"

const forbiddenPublicMaterial = [
  /\.agents/iu,
  /AGENTS\.md/iu,
  /apps\/agent/iu,
  /authorization\s*:\s*bearer/iu,
  /access_token\s*=/iu,
  /private\.example/iu,
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

describe("公開MCP promptとresource", () => {
  it("上限付きexternal workflow promptを1つ公開する", async () => {
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

  it("固定read-only guideだけを公開する", async () => {
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
    const normalizedContents = contents.flatMap((content) =>
      Array.isArray(content) ? content : [content]
    )
    expect(
      normalizedContents
        .flatMap((content) => ("text" in content ? [content.text ?? ""] : []))
        .join("\n")
    ).toContain("tools/list")
    expectPublicProjection({ resources, contents })
  })

  it("fallback toolを追加せず未知または不正なrequestを拒否する", async () => {
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
    await Promise.all(
      [null, [], { request: " " }, { request: "x".repeat(4_001) }].map((args) =>
        expect(
          publicMcpPrompts.getPromptMessages?.({
            name: "triage_issue",
            args,
            extra: requestExtra,
          })
        ).rejects.toThrow(/request argument is required|valid request/)
      )
    )
  })

  it("prompt引数のcredentialやprivate URLを反射しない", async () => {
    const messages = await publicMcpPrompts.getPromptMessages?.({
      name: "triage_issue",
      args: {
        request:
          "Authorization: Bearer TEST_TOKEN https://private.example.test/a?access_token=SECRET",
      },
      extra: requestExtra,
    })

    expect(JSON.stringify(messages)).not.toContain("TEST_TOKEN")
    expect(JSON.stringify(messages)).not.toContain("SECRET")
    expectPublicProjection(messages)
  })
})
