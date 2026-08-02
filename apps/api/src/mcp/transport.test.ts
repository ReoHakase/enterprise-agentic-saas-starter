import { createTool } from "@mastra/core/tools"
import { describe, expect, it } from "vitest"

import { createMcpServer, createProductionMcpServer } from "./server"
import { MCP_HTTP_PATH, handleMcpRequest } from "./transport"

const callMcp = async (
  server: ReturnType<typeof createMcpServer>,
  body: Record<string, unknown>
) => {
  const response = await handleMcpRequest(
    server,
    new Request(`https://api.example.test${MCP_HTTP_PATH}`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        host: "api.example.test",
      },
      body: JSON.stringify(body),
    })
  )

  const text = await response.text()
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("application/json")
  const parsed: unknown = JSON.parse(text)
  return parsed
}

const echoTool = createTool({
  id: "test_echo",
  description: "Echo a test value.",
  inputSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  } as const,
  execute: async (input) => {
    if (typeof input !== "object" || input === null || !("value" in input)) {
      throw new TypeError("Expected a value")
    }
    return { value: input.value }
  },
})

describe("Mastra MCP serverless transport", () => {
  it("handles initialize, tools/list, and tools/call without a session", async () => {
    const server = createMcpServer({ tools: { test_echo: echoTool } })

    const initialized = await callMcp(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "api-mcp-test", version: "1.0.0" },
      },
    })
    expect(initialized).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "Enterprise Agentic SaaS", version: "0.0.1" },
      },
    })

    const listed = await callMcp(server, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    })
    expect(listed).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: { tools: [{ name: "test_echo" }] },
    })

    const called = await callMcp(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "test_echo", arguments: { value: "hello" } },
    })
    expect(called).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: {
        content: [{ type: "text", text: '{"value":"hello"}' }],
        isError: false,
      },
    })
  })

  it("keeps the production registry empty until authorization is available", async () => {
    const server = createProductionMcpServer()
    expect(await server.getToolListInfo()).toEqual({ tools: [] })
  })
})
