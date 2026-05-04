---
name: backend-api
description: enterprise-agentic-saas-starterのElysia API、apps/api、feature-first modules、app.ts/index.ts/client.ts、Valibot model、Eden、OpenAPI、OpenTelemetry、service/repository境界、Effectを使わない方針を変更するときに使う。
---

# Backend API

このskillは `apps/api` の実装で使う。backendは早期にpackage分割せず、Elysiaの型推論、Eden、`app.handle()` testを活かす。

## 標準構成

```txt
apps/api/src/
  app.ts       # app composition only
  index.ts     # listen only
  client.ts    # Eden client export
  env.ts       # Valibot env parse
  plugins/
    db.ts
    auth.ts
    error.ts
    request-id.ts
    openapi.ts
    telemetry.ts
  errors/
  modules/
    todos/
      index.ts
      model.ts
      service.ts
      repository.ts
      test.ts
```

## 方針

- `app.ts` はElysia appを組み立てるだけ。listenしない。
- `index.ts` は起動だけ。clientやtestからimportしない。
- `client.ts` はEden clientをexportする。
- featureは `modules/<feature>` に置く。todo題材でも、group/permission/org前提のSaaS設計を崩さない。
- `model.ts` はValibot schemaと `InferOutput` 型。
- routeでparseし、typed inputをserviceへ渡す。
- serviceへElysia Context丸ごとを渡さない。
- repositoryはDrizzle/libSQL accessを持ち、DB errorを `cause/privateContext` 付きに包む。
- Effectは使わない。通常の `async` / `Promise` / `AppError` / `Error.cause` で揃える。

## Elysia plugin

- `db`, `auth`, `error`, `request-id` はplugin化する。
- OpenAPI pluginを使い、API contract確認とドキュメント生成に使う。
- OpenTelemetry pluginを使い、request trace/latency/errorを観測可能にする。
- pluginはcompositionに閉じ、service層へframework依存を漏らさない。

## テスト

- API integrationは `createApp()` と `app.handle(new Request(...))` を優先する。
- auth/group/permissionはhappy pathだけでなく、unauthorized/forbidden/not foundを確認する。
- E2Eに行く前に、Valibot schema、service、repository、Elysia handlerをVitestで押さえる。

詳細なファイル例が必要なときだけ `references/backend-api.md` を読む。
