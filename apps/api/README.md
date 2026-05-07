# @enterprise-agentic-saas/api

Elysia on Bun の API app workspace。

## 役割

- `createApp(db)` で Elysia app を組み立てる（テスト可能な最小ファクトリ）。
- `index.ts` は本番 plugin を合成して listen する。
- `client.ts` は Eden client を export する。
- 本番固有の関心事（auth, cors, OTel, logging, server-timing）は `plugins/` の独立 Elysia plugin。

## 公開 entrypoint

- `@enterprise-agentic-saas/api/client`: `createApiClient`, `ApiClient`
- `@enterprise-agentic-saas/api/types`: `App`

## 依存方向

- `apps/api -> packages/db`
- `apps/api -> packages/auth`
- `packages/* -> apps/api` は禁止。

## Env 境界

環境変数は [`src/env.ts`](src/env.ts) で [envin](https://github.com/turbostarter/envin) + Valibot により検証する。API 固有の env のみ管理する。`@enterprise-agentic-saas/db` / `@enterprise-agentic-saas/auth` が管理する env（`TURSO_DATABASE_URL`, `BETTER_AUTH_SECRET` 等）は各 package が検証するため、ここでは重複させない。

主な env:

- `PORT`
- `APP_NAME`
- `APP_BASE_URL`
- `API_PUBLIC_URL`
- `CORS_ORIGIN`
- `NODE_ENV`

## Validation

API **route** schema は Elysia の `t` / TypeBox に寄せる。**環境変数** 用に限り Valibot を `src/env.ts` で使う。

## テスト

```sh
bun run test
```

API integration は `createApp(testDb())` と `app.handle(new Request(...))` を使う。テストは `@enterprise-agentic-saas/auth` / `@enterprise-agentic-saas/db` を import しないため起動が軽い。

## 入れてはいけないもの

- `packages/api-client`
- Valibot route schema（環境変数の Valibot は `src/env.ts` のみ）
- packages から apps への逆依存
- raw secret や DB URL を error response へ返す処理
