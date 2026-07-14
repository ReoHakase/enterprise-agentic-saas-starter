# Backend API Reference

## app.ts — createApp(db)

テスト可能な最小ファクトリ。引数は `db` のみ。

```ts
import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { errorPlugin } from "./plugins/error"
import { observabilityPlugin } from "./plugins/observability"
import { openApiPlugin } from "./plugins/openapi"
import { requestIdPlugin } from "./plugins/request-id"

export const createApp = (db: Db) =>
  new Elysia()
    .use(requestIdPlugin)
    .use(observabilityPlugin)
    .use(errorPlugin)
    .decorate("db", db)
    .get("/health", () => ({ status: "ok" as const }), {
      response: t.Object({ status: t.Literal("ok") }),
    })
    .use(openApiPlugin)

export type App = ReturnType<typeof createApp>
```

## index.ts — 本番合成 + listen

SentryをDBやappより先に初期化してから、本番固有pluginを合成する。テストからはimportしない。

```ts
import { initializeBunObservability } from "./observability/sentry-bun"

initializeBunObservability()

const [
  { db },
  { createApp },
  { env },
  { authPlugin },
  { corsPlugin },
  { serverTimingPlugin },
] = await Promise.all([
  import("@enterprise-agentic-saas/db"),
  import("./app"),
  import("./env"),
  import("./plugins/auth"),
  import("./plugins/cors"),
  import("./plugins/server-timing"),
])

const app = createApp(db)
  .use(authPlugin)
  .use(corsPlugin)
  .use(serverTimingPlugin)

app.listen(env.PORT)
```

## client.ts — Eden client

```ts
import { treaty, type Treaty } from "@elysia/eden"
import type { App } from "./app"

export const createApiClient = (baseUrl: string): Treaty.Create<App> =>
  treaty<App>(baseUrl)
```

## 本番 plugin 例

各 plugin は env やシングルトンを自分で読む。ファクトリ引数なし。

```ts
// plugins/auth.ts
import { auth } from "@enterprise-agentic-saas/auth"
import { Elysia } from "elysia"

export const authPlugin = new Elysia({ name: "auth" }).mount(auth.handler)
```

```ts
// plugins/cors.ts
import { cors } from "@elysia/cors"
import { Elysia } from "elysia"
import { env } from "../env"

export const corsPlugin = new Elysia({ name: "cors" }).use(
  cors({
    credentials: true,
    exposeHeaders: ["Server-Timing"],
    origin: env.CORS_ORIGIN,
  })
)
```

## module 例

```txt
modules/todos/
  index.ts       # Elysia routes
  model.ts       # Valibot Standard Schema
  service.ts     # business logic
  repository.ts  # Drizzle access
  test.ts
```

todo は単純でも、tenant/group/permission 前提で設計する。repository query には tenant id や organization id を含める。

## Valibot Standard Schemaを使うroute schema

```ts
import { Elysia } from "elysia"
import * as v from "valibot"

const createTodoBody = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  organizationId: v.pipe(v.string(), v.minLength(1)),
})

export const todosModule = new Elysia({ prefix: "/todos" }).post(
  "/",
  async ({ body, db, session }) => {
    return await createTodo(db, session.user.id, body)
  },
  {
    body: createTodoBody,
  }
)
```

## テストパターン

```ts
import { createClient } from "@libsql/client"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { drizzle } from "drizzle-orm/libsql"
import { describe, expect, it } from "vitest"
import { createApp } from "./app"

const testDb = () =>
  drizzle(createClient({ url: "file::memory:?cache=shared" }), { schema })

describe("createApp", () => {
  it("responds to health checks", async () => {
    const app = createApp(testDb())
    const response = await app.handle(new Request("http://localhost/health"))
    expect(response.status).toBe(200)
  })
})
```

## OpenAPI / observability

- OpenAPI は API 確認・client integration 確認用。実装の source of truth を二重管理しすぎない。
- Bunはapp import前に`@sentry/bun`、CloudflareはWorker handlerを`@sentry/cloudflare`の`withSentry`でwrapする。`createApp(db)`へruntime clientを渡さない。
- Sentry trace/logはrequest id、正規化route、status、duration、error codeを追えるようにする。CloudflareのSentry OTLP destinationと二重送信しない。
- secret、raw body/header/query、email、tenant/resource IDをspan/log attributeに載せず、送信直前のscrubberでも除去する。
