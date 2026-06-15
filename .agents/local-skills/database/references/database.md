# Database Reference

## singleton db

```ts
// packages/db/src/index.ts
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

import { env } from "./env.js"
import * as schema from "./schema/index.js"

const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
export type Db = typeof db
```

## env

```ts
// packages/db/src/env.ts
import { defineEnv } from "envin"
import * as v from "valibot"

export const env = defineEnv({
  server: {
    TURSO_DATABASE_URL: v.pipe(v.string(), v.minLength(1)),
    TURSO_AUTH_TOKEN: v.optional(v.pipe(v.string(), v.minLength(1))),
  },
  isServer: true,
  env: process.env,
})
```

## auth schema 生成

`src/schema/auth.ts` は手書きせず、Better Auth CLI で生成する。

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.ts \
  --yes
```

auth pluginの構成を変えたら再生成 → git diff で確認 → commit。

## app schema

```ts
// packages/db/src/schema/app.ts
import { sql } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
})
```

multi-tenant tableは `organizationId` などtenant境界をqueryで必ず使う。timestamp は `mode: "timestamp_ms"`（ミリ秒）に統一する。

## drizzle.config.ts

```ts
import { defineConfig } from "drizzle-kit"
import { env } from "./src/env.js"

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  dialect: "turso",
  dbCredentials: {
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  },
})
```

Turso 接続文字列は `packages/db/src/env.ts`（envin + Valibot）で検証する。`packages/db/.env*` に置く。

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
