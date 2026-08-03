import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"

import type { AuthorizationService } from "../modules/authorization/public"
import {
  authenticateMcpRequest,
  type VerifyMcpOAuthAccessToken,
} from "./authentication"
import { createProductionMcpServer } from "./server"
import { createMcpTools } from "./tools/catalog"
import { uploadMcpAttachment } from "./tools/upload-application"
import { MCP_HTTP_PATH, handleMcpRequest } from "./transport"

const protectedResourceMetadataPath =
  "/.well-known/oauth-protected-resource/mcp"
const authorizationServerMetadataPath =
  "/.well-known/oauth-authorization-server/auth"
const mcpUploadPath = "/mcp/uploads/:uploadId"

const unauthorizedResponse = (resource: string) =>
  Response.json(
    { error: "unauthorized", message: "Authentication is required." },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": `Bearer resource_metadata="${new URL(
          protectedResourceMetadataPath,
          resource
        ).toString()}"`,
      },
    }
  )

const reconstructMcpRequest = (request: Request, body: unknown) => {
  if (request.method !== "POST") return request
  return new Request(request.url, {
    body: JSON.stringify(body),
    headers: request.headers,
    method: request.method,
  })
}

export type McpModuleOptions = {
  getProtectedResourceMetadata: () => Promise<unknown>
  handleAuthorizationServerMetadata: (request: Request) => Promise<Response>
  resource: string
  verifyAccessToken: VerifyMcpOAuthAccessToken
}

export const createMcpModule = (
  db: Db,
  authorization: AuthorizationService,
  {
    getProtectedResourceMetadata,
    handleAuthorizationServerMetadata,
    resource,
    verifyAccessToken,
  }: McpModuleOptions
) =>
  new Elysia({ name: "mcp" })
    .all(
      authorizationServerMetadataPath,
      ({ request }) => handleAuthorizationServerMetadata(request),
      { detail: { hide: true } }
    )
    .all(
      protectedResourceMetadataPath,
      async ({ request }) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response(null, {
            status: 405,
            headers: { allow: "GET, HEAD" },
          })
        }
        const metadata = await getProtectedResourceMetadata()
        return new Response(
          request.method === "HEAD" ? null : JSON.stringify(metadata),
          {
            headers: {
              "cache-control":
                "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
              "content-type": "application/json",
            },
          }
        )
      },
      { detail: { hide: true } }
    )
    .all(
      MCP_HTTP_PATH,
      async ({ body, request, set }) => {
        if (request.method !== "POST") {
          return new Response(null, {
            status: 405,
            headers: { allow: "POST" },
          })
        }
        const principal = await authenticateMcpRequest({
          authorization,
          request,
          resource,
          verifyAccessToken,
        })
        if (!principal) return unauthorizedResponse(resource)
        const response = await handleMcpRequest(
          createProductionMcpServer(createMcpTools(db, principal)),
          reconstructMcpRequest(request, body)
        )
        set.status = response.status
        for (const [name, value] of response.headers) {
          set.headers[name] = value
        }
        return response
      },
      { detail: { hide: true } }
    )
    .all(
      mcpUploadPath,
      async ({ params, request }) => {
        const principal = await authenticateMcpRequest({
          authorization,
          request,
          resource,
          verifyAccessToken,
        })
        if (!principal) return unauthorizedResponse(resource)
        return uploadMcpAttachment({
          db,
          principal,
          request,
          uploadId: params.uploadId,
        })
      },
      { detail: { hide: true } }
    )
