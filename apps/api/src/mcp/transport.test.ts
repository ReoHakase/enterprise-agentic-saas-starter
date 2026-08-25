import { describe, expect, it } from "vitest"

import { createMcpServer, createProductionMcpServer } from "./server"
import { MCP_HTTP_PATH, handleMcpRequest } from "./transport"

describe("Mastra MCPのserverless transport", () => {
  it("listenerを開始する前にPOST以外のrequestを拒否する", async () => {
    const response = await handleMcpRequest(
      createMcpServer(),
      new Request(`https://api.example.test${MCP_HTTP_PATH}`, {
        method: "GET",
      })
    )

    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("POST")
    expect(response.headers.get("content-type")).toBeNull()
  })

  it("認可がないproduction registryを空に保つ", async () => {
    const server = createProductionMcpServer({})
    expect(await server.getToolListInfo()).toEqual({ tools: [] })
  })
})
