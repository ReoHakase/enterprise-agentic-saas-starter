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
    env.ts           # envin + Valibot (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
    schema/
      auth.ts        # Better Auth CLI で生成 — 手書き禁止
      app.ts         # アプリ固有テーブル (todos 等)
      index.ts       # re-export
    seed/
      dev.ts         # 開発用seed
    index.ts         # singleton db export
  scripts/
    dev.ts           # turso dev → push → seed → studio
  drizzle.config.ts
```

## singleton export

`packages/db/src/index.ts` は singleton の `db` をexportする。ファクトリは作らない。

```ts
import { db } from "@enterprise-agentic-saas/db"; // singleton
import type { Db } from "@enterprise-agentic-saas/db"; // 型
import * as schema from "@enterprise-agentic-saas/db/schema"; // テーブル定義
```

env変数は `src/env.ts`（envin + Valibot）で検証し、`src/index.ts` が import 時に読む。`apps/api` 側で重複して読む必要はない。

## auth schema 生成

`src/schema/auth.generated.ts` は Better Auth CLI で生成する。手で書かない。

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.generated.ts \
  --yes
```

auth pluginの構成（magicLink, organization 等）を変えたら必ず再生成する。生成後の差分はgit diffで確認してcommitする。

## apps/apiとの境界

- `apps/api` は `import { db } from "@enterprise-agentic-saas/db"` でsingleton を受け取り、`decorate("db", db)` する。
- routeからserviceへ必要なDBを渡す。serviceへElysia Context丸ごとは渡さない。
- repositoryはDrizzle errorをcatchして、`publicErrors.internal(cause, { operation })` の形に包む。

## MCP

- Tursoの現在仕様やCLI/APIの確認が必要なときはTurso MCPまたは公式情報を優先する。
- Drizzle/Tursoのバージョン差分は変わりやすいので、依存追加やmigration設定変更前に確認する。
- 開発用DBは `packages/db/.local/turso/dev.db` に永続化する。gitには入れない。
- local dev bootstrapは `turso dev -> drizzle-kit push -> seed -> drizzle-kit studio` の順に `packages/db` の `dev` scriptでまとめる。
- 開発中の即時反映は `drizzle-kit push` を使う。migration artifactをレビュー・保存する段階になったら `generate` / migration運用へ移す。
- seedは `drizzle-seed` を使う。auth/appの `text("id")` primary key は実アプリの生成と合わせて `f.uuid()` を明示し、整数風や任意文字列のIDを混ぜない。
- local devで `turso dev` を使う場合、Turso CLIだけでなく `sqld` が `PATH` に必要。Cloud DB作成は `turso auth login` 済みでないと実行できない。

具体的なschema/client/migration例が必要なときだけ `references/database.md` を読む。

## package品質

- `packages/db/.oxlintrc.json` はserver-only TypeScript向けにし、React/Browser系pluginは入れない。
- READMEには役割、公開entrypoint、依存方向、env境界、test方法、入れないものを書く。
- unit testでは実Turso接続を要求せず、`file::memory:` でclient境界とschema exportを確認する。
