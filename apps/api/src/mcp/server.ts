import type { ToolsInput } from "@mastra/core/agent"
import { MCPServer } from "@mastra/mcp"

const MCP_SERVER_ID = "enterprise-agentic-saas"
const MCP_SERVER_NAME = "Enterprise Agentic SaaS"
const MCP_SERVER_VERSION = "0.0.1"

type CreateMcpServerOptions = {
  tools?: ToolsInput
}

export const createMcpServer = ({ tools = {} }: CreateMcpServerOptions = {}) =>
  new MCPServer({
    id: MCP_SERVER_ID,
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    description:
      "Organization-scoped business tools for Enterprise Agentic SaaS.",
    tools,
  })

export const createProductionMcpServer = (tools: ToolsInput) =>
  createMcpServer({ tools })
