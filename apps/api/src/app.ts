import type { Db } from "@enterprise-agentic-saas/db"
import { sql } from "drizzle-orm"
import { Elysia } from "elysia"

import { publicErrors } from "./errors/app-error"
import {
  apiErrorModel,
  healthResponseModel,
  readinessResponseModel,
} from "./models/api"
import { createAuditModule } from "./modules/audit"
import { createFilesModule } from "./modules/files"
import { createIssuesModule } from "./modules/issues"
import { createOrganizationsModule } from "./modules/organizations"
import { createProfileImagesModule } from "./modules/profile-images"
import { createUsersModule } from "./modules/users"
import { withObservedSpan } from "./observability/runtime"
import { csrfPlugin } from "./plugins/csrf"
import { errorPlugin } from "./plugins/error"
import { observabilityPlugin } from "./plugins/observability"
import { openApiPlugin } from "./plugins/openapi"
import { requestIdPlugin } from "./plugins/request-id"

export const createApp = (db: Db) =>
  new Elysia()
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
          500: apiErrorModel,
        },
        detail: {
          operationId: "healthCheck",
          summary: "API health check",
          description: "processがHTTP requestを処理できることを確認する。",
          tags: ["System"],
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
              throw publicErrors.unavailable(cause)
            }
          }
        ),
      {
        response: {
          200: readinessResponseModel,
          500: apiErrorModel,
          503: apiErrorModel,
        },
        detail: {
          operationId: "readinessCheck",
          summary: "API readiness check",
          description:
            "processがrequestを処理でき、Turso/libSQLへqueryできることを確認する。失敗時は依存先詳細を公開しない。",
          tags: ["System"],
        },
      }
    )
    .use(createUsersModule(db))
    .use(createOrganizationsModule(db))
    .use(createIssuesModule(db))
    .use(createFilesModule(db))
    .use(createProfileImagesModule(db))
    .use(createAuditModule(db))
    .use(openApiPlugin)

export type App = ReturnType<typeof createApp>
