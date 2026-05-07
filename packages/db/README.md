# @enterprise-agentic-saas/db

Turso/libSQL + Drizzle ORM によるデータベースパッケージ。

## Entrypoints

| import | 内容 |
|---|---|
| `@enterprise-agentic-saas/db` | singleton `db` インスタンス、`Db` 型 |
| `@enterprise-agentic-saas/db/schema` | 全テーブル定義（auth + app） |

## Schema

- `src/schema/auth.ts` — Better Auth CLI で生成（**手書き禁止**）
- `src/schema/app.ts` — アプリ固有テーブル（todos 等）

### auth schema の再生成

auth plugin 構成を変更したら以下を実行する:

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.ts \
  --yes
```

## 依存方向

- `packages/auth -> packages/db` — 許可
- `apps/api -> packages/db` — 許可
- `packages/db -> packages/auth` — **禁止**

## 環境変数

`packages/db/.env` に設定する（`src/env.ts` で envin + Valibot 検証）。

| 変数 | 必須 | 説明 |
|---|---|---|
| `TURSO_DATABASE_URL` | Yes | Turso / libSQL の接続 URL |
| `TURSO_AUTH_TOKEN` | No | Turso Cloud 用の認証トークン |

## Scripts

```sh
bun run dev        # turso dev → push → seed → studio を一括起動
bun run push       # drizzle-kit push（開発中の即時反映）
bun run generate   # drizzle-kit generate（migration artifact 生成）
bun run seed       # 開発用 seed データ投入
bun run studio     # Drizzle Studio 起動
bun run test       # Vitest 実行
```

## テスト

実 Turso 接続は要求しない。`file::memory:` で client 境界と schema export を確認する。

```ts
import { createClient } from "@libsql/client"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { drizzle } from "drizzle-orm/libsql"

const testDb = () =>
  drizzle(createClient({ url: "file::memory:?cache=shared" }), { schema })
```

## 入れないもの

- PostgreSQL / `DB_PROVIDER` / dialect 分岐
- `createDb()` ファクトリ — singleton で十分
- React / Browser 系の依存
