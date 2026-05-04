# Database Reference

## client

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type CreateDbOptions = {
  url: string;
  authToken?: string;
};

export function createDb(options: CreateDbOptions) {
  const client = createClient({
    url: options.url,
    authToken: options.authToken,
  });

  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

## schema

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

multi-tenant tableは `organizationId` などtenant境界をqueryで必ず使う。

## drizzle.config.ts

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
});
```

## repository

```ts
export async function findTodoByIdFromDb(
  db: Db,
  organizationId: string,
  id: string,
) {
  try {
    const [todo] = await db
      .select()
      .from(todos)
      .where(and(eq(todos.organizationId, organizationId), eq(todos.id, id)))
      .limit(1);

    return todo ?? null;
  } catch (cause) {
    throw publicErrors.internal(cause, {
      operation: "findTodoByIdFromDb",
    });
  }
}
```

## Turso確認

Turso MCPや公式docsで、Drizzle Kit dialect、libSQL client、auth tokenの扱いを確認してから設定を変える。
