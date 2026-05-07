---
name: backend-api
description: enterprise-agentic-saas-starterのElysia API、apps/api、feature-first modules、app.ts/index.ts/client.ts、Elysia t/TypeBox model、Eden、OpenAPI、OpenTelemetry、service/repository境界、Effectを使わない方針を変更するときに使う。
---

# Backend API

このskillは `apps/api` の実装で使う。backendは早期にpackage分割せず、Elysiaの型推論、Eden、`app.handle()` testを活かす。

## 標準構成

```txt
apps/api/src/
  app.ts       # createApp(db) — テスト可能な最小ファクトリ
  index.ts     # createApp(db) + 本番plugin合成 + listen
  client.ts    # Eden client export
  env.ts       # API固有のenv parse（db/authのenvは各packageが管理）
  plugins/
    auth.ts          # @enterprise-agentic-saas/auth singleton を mount
    cors.ts          # env から CORS origins を読む
    error.ts         # AppError → HTTP response + OTel span
    logix.ts         # logixlysia 設定を env から組む
    openapi.ts       # OpenAPI spec
    request-id.ts    # x-request-id 付与
    server-timing.ts # Server-Timing header
    telemetry.ts     # OpenTelemetry 計装
  errors/
    app-error.ts     # AppError class + publicErrors helper
  modules/
    todos/
      index.ts
      model.ts
      service.ts
      repository.ts
      test.ts
```

## アーキテクチャ原則

- `createApp(db)` は唯一のファクトリ。引数は `db: Db` のみ。テストと本番で共有する。
- 本番固有の関心事（auth, cors, OTel, logging, server-timing）は独立 Elysia plugin にし、`index.ts` で `.use()` 合成する。
- `runtime.ts` のような中間ファクトリは作らない。
- `env.ts` は API 固有の env だけ持つ。`@enterprise-agentic-saas/db` / `@enterprise-agentic-saas/auth` が管理する env を重複させない。
- `errors/` にバレル `index.ts` は置かない。直接 `app-error` を import する。

## 方針

- `app.ts` は Elysia app を組み立てるだけ。listen しない。
- `index.ts` は本番 plugin 合成 + listen だけ。client や test から import しない。
- `client.ts` は Eden client を export する。
- feature は `modules/<feature>` に置く。todo 題材でも、group/permission/org 前提の SaaS 設計を崩さない。
- `model.ts` は Elysia `t` / TypeBox schema と型を置く。
- route schema は `import { t } from "elysia"` に寄せる。`apps/api` へ Valibot を追加しない（env.ts のみ例外）。
- Elysia の route validation で typed input を service へ渡す。
- service へ Elysia Context 丸ごとを渡さない。
- repository は Drizzle/libSQL access を持ち、DB error を `cause/privateContext` 付きに包む。
- Effect は使わない。通常の `async` / `Promise` / `AppError` / `Error.cause` で揃える。

## Elysia plugin

- 各 plugin は `new Elysia({ name: "..." })` で名前を付け、dedup される。
- plugin は env やシングルトンを自分で読む。ファクトリ引数を取らない。
- `createApp` 内 plugin（error, request-id, openapi）はテストでも使う core。
- `index.ts` 専用 plugin（auth, cors, logix, telemetry, server-timing）は本番のみ。
- plugin は composition に閉じ、service 層へ framework 依存を漏らさない。

## テスト

- `createApp(testDb())` + `app.handle(new Request(...))` でテストする。
- テストは `@enterprise-agentic-saas/auth` / `@enterprise-agentic-saas/db` を import しない。起動が軽い。
- auth/group/permission は happy path だけでなく、unauthorized/forbidden/not found を確認する。
- E2E に行く前に、Elysia `t` schema、service、repository、Elysia handler を Vitest で押さえる。

## package 品質

- `apps/api/.oxlintrc.json` は server/Bun 向けに `node`, `promise`, `typescript`, `unicorn`, `oxc`, `import` を使う。
- React/Next/Tailwind/jsx-a11y plugin は `apps/api` へ入れない。
- README には役割、公開 entrypoint、依存方向、env 境界、validation 方針、test 方法を書く。
- API integration test は必須。`app.handle(new Request(...))` で health/auth mount/error response を確認する。

詳細なファイル例が必要なときだけ `references/backend-api.md` を読む。
