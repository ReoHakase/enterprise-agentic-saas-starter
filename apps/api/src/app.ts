import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { apiErrorModel } from "./models/api"
import { createAuditModule } from "./modules/audit"
import { createOrganizationsModule } from "./modules/organizations"
import { createTodosModule } from "./modules/todos"
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
          200: t.Object({
            status: t.Literal("ok"),
          }),
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
    .use(createUsersModule(db))
    .use(createOrganizationsModule(db))
    .use(createTodosModule(db))
    .use(createAuditModule(db))
    .use(openApiPlugin)

export type App = ReturnType<typeof createApp>
