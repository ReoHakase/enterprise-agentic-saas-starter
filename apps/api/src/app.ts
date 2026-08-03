import type { Db } from "@enterprise-agentic-saas/db"
import { sql } from "drizzle-orm"
import { Elysia } from "elysia"

import { HttpError } from "./errors/http-error"
import { createMcpModule, type McpModuleOptions } from "./mcp"
import {
  errorResponseModel,
  healthResponseModel,
  readinessResponseModel,
} from "./models/api"
import { createAgentModule } from "./modules/agent/module"
import { createAuditModule } from "./modules/audit/module"
import { createAuthorizationModule } from "./modules/authorization/module"
import { createFilesModule } from "./modules/files/module"
import { createIssuesModule } from "./modules/issues/module"
import { createOrganizationsModule } from "./modules/organizations/module"
import { createProfileImagesModule } from "./modules/profile-images/module"
import { createUsersModule } from "./modules/users/module"
import { withObservedSpan } from "./platform/observability/runtime"
import { csrfPlugin } from "./platform/plugins/csrf"
import { errorPlugin } from "./platform/plugins/error"
import { observabilityPlugin } from "./platform/plugins/observability"
import { openApiPlugin } from "./platform/plugins/openapi"
import { requestIdPlugin } from "./platform/plugins/request-id"

const disabledMcp: McpModuleOptions = {
  getProtectedResourceMetadata: async () => ({
    authorization_servers: [],
    resource: "http://localhost/mcp",
    scopes_supported: [],
  }),
  handleAuthorizationServerMetadata: async () =>
    new Response(null, { status: 404 }),
  resource: "http://localhost/mcp",
  verifyAccessToken: async () => null,
}

export const createApp = (
  db: Db,
  { mcp = disabledMcp }: { mcp?: McpModuleOptions } = {}
) => {
  const authorization = createAuthorizationModule(db)

  return new Elysia()
    .use(requestIdPlugin)
    .use(observabilityPlugin)
    .use(errorPlugin)
    .use(csrfPlugin)
    .decorate("db", db)
    .get(
      "/health",
      () =>
        withObservedSpan(
          {
            name: "API health check",
            op: "health.check",
          },
          () => ({
            status: "ok" as const,
          })
        ),
      {
        response: {
          200: healthResponseModel,
          500: errorResponseModel,
        },
        detail: {
          operationId: "healthCheck",
          security: [],
          summary: "API health check",
          description:
            "Confirms that the public API process can accept and complete an HTTP request without contacting external dependencies.",
          tags: ["System"],
          "x-route-status": "enabled",
          "x-auth-context": "none",
          "x-audience": "general",
        },
      }
    )
    .get(
      "/ready",
      () =>
        withObservedSpan(
          {
            name: "API readiness check",
            op: "readiness.check",
          },
          async () => {
            try {
              await db.run(sql`select 1`)
              return { status: "ready" as const }
            } catch (cause) {
              throw new HttpError({
                code: "service_unavailable",
                cause: cause,
                retryAfter: 30,
              })
            }
          }
        ),
      {
        response: {
          200: readinessResponseModel,
          500: errorResponseModel,
          503: errorResponseModel,
        },
        detail: {
          operationId: "readinessCheck",
          security: [],
          summary: "API readiness check",
          description:
            "Confirms that the API can query its Turso/libSQL dependency; failures return a bounded response without provider details.",
          tags: ["System"],
          "x-route-status": "enabled",
          "x-auth-context": "none",
          "x-audience": "general",
        },
      }
    )
    .use(createUsersModule(db, authorization.createAccessControl))
    .use(
      createOrganizationsModule(
        db,
        authorization.authorization,
        authorization.createAccessControl
      )
    )
    .use(createAgentModule(db, authorization.createAccessControl))
    .use(
      createIssuesModule(
        db,
        authorization.authorization,
        authorization.createAccessControl
      )
    )
    .use(
      createFilesModule(
        db,
        authorization.authorization,
        authorization.createAccessControl
      )
    )
    .use(createProfileImagesModule(db, authorization.createAccessControl))
    .use(createAuditModule(db, authorization.createAccessControl))
    .use(createMcpModule(authorization.authorization, mcp))
    .use(openApiPlugin)
}

export type App = ReturnType<typeof createApp>
