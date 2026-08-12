import type { MCPServer } from "@mastra/mcp"
import { toFetchResponse, toReqRes } from "fetch-to-node"

export const MCP_HTTP_PATH = "/mcp"

const mcpMethodNotAllowedResponse = () =>
  new Response(null, {
    status: 405,
    headers: { allow: "POST" },
  })

export const handleMcpRequest = async (
  server: MCPServer,
  request: Request
): Promise<Response> => {
  if (request.method !== "POST") return mcpMethodNotAllowedResponse()
  const { req, res } = toReqRes(request)

  await server.startHTTP({
    url: new URL(request.url),
    httpPath: MCP_HTTP_PATH,
    req,
    res,
    options: { serverless: true },
  })

  return await toFetchResponse(res)
}
