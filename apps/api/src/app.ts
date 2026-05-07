import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { createOrganizationsModule } from "./modules/organizations"
import { createTodosModule } from "./modules/todos"
import { errorPlugin } from "./plugins/error"
import { openApiPlugin } from "./plugins/openapi"
import { requestIdPlugin } from "./plugins/request-id"

export const createApp = (db: Db) =>
  new Elysia()
    .use(requestIdPlugin)
    .use(errorPlugin)
    .decorate("db", db)
    .get(
      "/health",
      () => ({
        status: "ok" as const,
      }),
      {
        response: t.Object({
          status: t.Literal("ok"),
        }),
      }
    )
    .use(createOrganizationsModule(db))
    .use(createTodosModule(db))
    .use(openApiPlugin)

export type App = ReturnType<typeof createApp>
