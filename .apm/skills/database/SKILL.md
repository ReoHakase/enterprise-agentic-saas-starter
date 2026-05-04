---
name: database
description: enterprise-agentic-saas-starterのTurso/libSQL、Drizzle、SQLite schema、packages/db、migration、DB env、Turso MCP、apps/api db plugin、repository、PostgresやDB_PROVIDERを追加すべきか判断するときに使う。
---

# Database

このskillは `packages/db`、Turso/libSQL、Drizzle schema/client/migrationを変更するときに使う。

## 方針

- primary DBはTurso/libSQL。
- `packages/db` はSQLite/libSQL専用。
- schemaは `sqliteTable` のみ。
- clientは `drizzle-orm/libsql` と `@libsql/client`。
- Drizzle Kitは `dialect: "turso"`。
- `DB_PROVIDER` やdialect分岐は作らない。
- Postgres対応は明示要求があるまで入れない。

## 構成

```txt
packages/db/
  src/
    schema/
      auth/
      app/
      index.ts
    client.ts
    index.ts
  drizzle.config.ts
```

`packages/db` はenvを直接読まない。`createDb({ url, authToken })` のようにappから値を受け取る。

## apps/apiとの境界

- `apps/api/src/env.ts` で `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` をValibot parseする。
- `apps/api/src/plugins/db.ts` でDB instanceを作り、Elysia contextにdecorateする。
- routeからserviceへ必要なDBを渡す。serviceへElysia Context丸ごとは渡さない。
- repositoryはDrizzle errorをcatchして、`publicErrors.internal(cause, { operation })` の形に包む。

## MCP

- Tursoの現在仕様やCLI/APIの確認が必要なときはTurso MCPまたは公式情報を優先する。
- Drizzle/Tursoのバージョン差分は変わりやすいので、依存追加やmigration設定変更前に確認する。

具体的なschema/client/migration例が必要なときだけ `references/database.md` を読む。
