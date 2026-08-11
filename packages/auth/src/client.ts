import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { passkeyClient } from "@better-auth/passkey/client"
import {
  magicLinkClient,
  multiSessionClient,
  organizationClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export {
  MCP_OAUTH_SCOPES,
  MCP_PERMISSION_SCOPES,
  type McpPermissionScope,
} from "./mcp-oauth-contract"

export const createAuthClientForBaseUrl = (baseURL: string) =>
  createAuthClient({
    baseURL,
    basePath: "/auth",
    plugins: [
      passkeyClient(),
      magicLinkClient(),
      multiSessionClient(),
      organizationClient(),
      oauthProviderClient(),
    ],
  })
