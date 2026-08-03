import type { ToolsInput } from "@mastra/core/agent"
import {
  MCPServer,
  type MCPServerPrompts,
  type MCPServerResources,
} from "@mastra/mcp"
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker"

import { publicMcpPrompts } from "./prompts/public"
import { publicMcpResources } from "./resources/public"

const MCP_SERVER_ID = "enterprise-agentic-saas"
const MCP_SERVER_NAME = "Enterprise Agentic SaaS"
const MCP_SERVER_VERSION = "0.0.1"
const jsonSchemaValidator = new CfWorkerJsonSchemaValidator()

type CreateMcpServerOptions = {
  prompts?: MCPServerPrompts
  resources?: MCPServerResources
  tools?: ToolsInput
}

export const createMcpServer = ({
  prompts = publicMcpPrompts,
  resources = publicMcpResources,
  tools = {},
}: CreateMcpServerOptions = {}) =>
  new MCPServer({
    id: MCP_SERVER_ID,
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    description:
      "Organization-scoped business tools for Enterprise Agentic SaaS.",
    prompts,
    resources,
    tools,
    jsonSchemaValidator,
  })

export const createProductionMcpServer = (tools: ToolsInput) =>
  createMcpServer({ tools })
