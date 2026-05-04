# Backend API Reference

## app/index/client

`apps/api/src/app.ts`:

```ts
import { Elysia } from "elysia";
import { dbPlugin } from "./plugins/db";
import { errorPlugin } from "./plugins/error";
import { openApiPlugin } from "./plugins/openapi";
import { telemetryPlugin } from "./plugins/telemetry";
import { todosModule } from "./modules/todos";

export function createApp() {
  return new Elysia()
    .use(telemetryPlugin)
    .use(errorPlugin)
    .use(openApiPlugin)
    .use(dbPlugin)
    .use(todosModule);
}

export const app = createApp();
export type App = typeof app;
```

`apps/api/src/index.ts`:

```ts
import { app } from "./app";
import { env } from "./env";

app.listen(env.PORT);
console.log(`API listening on http://localhost:${env.PORT}`);
```

`apps/api/src/client.ts`:

```ts
import { treaty } from "@elysiajs/eden";
import type { App } from "./app";

export const createApiClient = (baseUrl: string) => treaty<App>(baseUrl);
```

## module例

```txt
modules/todos/
  index.ts       # Elysia routes
  model.ts       # Valibot schema
  service.ts     # business logic
  repository.ts  # Drizzle access
  test.ts
```

todoは単純でも、tenant/group/permission前提で設計する。repository queryにはtenant idやorganization idを含める。

## Valibot route parse

```ts
const parsed = v.safeParse(CreateTodoInputSchema, body);
if (!parsed.success) {
  throw publicErrors.validation("Invalid request", parsed.issues);
}

return await createTodo(db, session.user.id, parsed.output);
```

## OpenAPI / OpenTelemetry

- OpenAPIはAPI確認・client integration確認用。実装のsource of truthを二重管理しすぎない。
- OpenTelemetryはrequest id、route、status、duration、error codeを追えるようにする。
- secretやraw bodyをspan attributeに載せない。
