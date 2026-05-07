# @enterprise-agentic-saas/auth

Better Auth による認証・認可パッケージ。

## Entrypoints

| import | 内容 |
|---|---|
| `@enterprise-agentic-saas/auth` | singleton `auth` インスタンス（server-only） |
| `@enterprise-agentic-saas/auth/client` | `authClient`（フロントエンド用） |

## Plugin 構成

- `magicLink` — マジックリンク認証
- `organization` — マルチテナント組織管理

## 依存方向

- `packages/auth -> packages/db` — 許可
- `apps/api -> packages/auth` — 許可
- `apps/web -> packages/auth/client` — 許可
- `packages/db -> packages/auth` — **禁止**

## 環境変数

Better Auth が `process.env` から自動読み込みする。`apps/api/.env` に設定する。

| 変数 | 必須 | 説明 |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | セッション署名用シークレット |
| `BETTER_AUTH_URL` | Yes | Better Auth のベース URL |
| `TRUSTED_ORIGINS` | No | カンマ区切りの信頼オリジン |

## Auth Schema

`packages/db/src/schema/auth.ts` に Better Auth CLI で生成する（**手書き禁止**）。

plugin 構成を変更したら再生成する:

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.ts \
  --yes
```

## apps/api での mount

```ts
import { auth } from "@enterprise-agentic-saas/auth"
// Elysia で mount
app.mount(auth.handler)
```

## 入れないもの

- `createAuth()` ファクトリ — singleton で十分
- React Email / email sender の直接 import
- resource permission（app 側に寄せる）
- audit log（app 側に寄せる）
