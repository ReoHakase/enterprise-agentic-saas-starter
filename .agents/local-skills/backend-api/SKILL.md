---
name: backend-api
description: enterprise-agentic-saas-starterのElysia API、apps/api、feature-first modules、app.ts/index.ts/worker.ts/client.ts、Elysia t/TypeBox model、Eden、OpenAPI、Sentry observability、service/repository境界、Effectを使わない方針を変更するときに使う。
---

# Backend API

このskillは `apps/api` の実装で使う。backendは早期にpackage分割せず、Elysiaの型推論、Eden、`app.handle()` testを活かす。

## 標準構成

```txt
apps/api/src/
  app.ts       # createApp(db) — テスト可能な最小ファクトリ
  index.ts     # Bun: Sentry初期化 + createApp(db) + 本番plugin合成 + listen
  worker.ts    # Workers: @sentry/cloudflare + Cloudflare adapter
  client.ts    # Eden client export
  env.ts       # API固有のenv parse（db/authのenvは各packageが管理）
  observability/
    runtime.ts            # appからruntime SDKを隠すnoop-safe bridge
    sentry-bun.ts         # Bun SDKをapp import前に初期化
    sentry-adapter.ts     # Sentry共通adapter
    sentry-options.ts     # PII scrubとsamplingの共通設定
    spotlight.ts          # local endpointだけを許可
    structured-console.ts # 許可済みmetadataだけを構造化出力
  plugins/
    auth.ts          # @enterprise-agentic-saas/auth singleton を mount
    cors.ts          # env から CORS origins を読む
    csrf.ts          # unsafe methodのOrigin検証
    error.ts         # AppError → safe HTTP response + Sentry capture
    observability.ts # request ID/route/status/durationを相関
    openapi.ts       # OpenAPI spec
    request-id.ts    # x-request-id 付与
    server-timing.ts # Server-Timing header
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
- 本番固有の関心事（auth, cors, server-timing）は独立 Elysia plugin にし、`index.ts` / `worker.ts` で `.use()` 合成する。
- app construction用の中間factoryは作らない。`observability/runtime.ts` はSDKをcore appから隔離し、test時にnoopで動かすbridgeとしてのみ許可する。
- `env.ts` は API 固有の env だけ持つ。`@enterprise-agentic-saas/db` / `@enterprise-agentic-saas/auth` が管理する env を重複させない。
- `errors/` にバレル `index.ts` は置かない。直接 `app-error` を import する。

## 方針

- `app.ts` は Elysia app を組み立てるだけ。listen しない。
- `index.ts` はBun Sentryを最初に初期化し、dynamic importで本番 pluginを合成してlistenする。clientやtestからimportしない。
- `worker.ts` はCloudflare SDKでhandlerをwrapする。Bun SDKをbundleしない。
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
- `createApp` 内 plugin（request-id, observability, error, csrf, openapi）はテストでも使うcore。
- entrypoint専用 plugin（auth, cors, server-timing）は本番のみ。
- plugin は composition に閉じ、service 層へ framework 依存を漏らさない。

## Sentryとruntime

- `createApp(db)`へSentry clientやenvを注入しない。Bun entrypointは`@sentry/bun`をapp importより前に初期化し、Cloudflare entrypointは`@sentry/cloudflare`の`withSentry`でWorker handlerをwrapする。
- workerd側は`nodejs_compat`または`nodejs_als`が必須。Bun SDKとCloudflare SDKを同じbundle/runtimeで同時初期化しない。
- Spotlightはdevelopmentかつlocalhost系endpointだけ許可し、error/log/traceを100%送る。productionではflagを無視し、DSN未設定ならSDKを無効にする。
- Sentry SDKから直接送る構成ではCloudflare WorkersのSentry OTLP destinationを併用しない。Workers Observabilityはplatform metrics/log確認の補助として残す。
- API source mapはWrangler dry-run bundleへSentry CLIでdebug IDを注入・uploadし、その同一artifactを`wrangler deploy --no-bundle`で送る。`upload_source_maps`だけでSentry upload済みと扱わない。
- structured logの相関keyはrequest ID、正規化route、status、duration、service/runtime/releaseに限定する。tenant/user/resource ID、email、body、cookie、tokenを属性へ載せない。

## テスト

- `createApp(testDb())` + `app.handle(new Request(...))` でテストする。
- テストはserver singletonの `@enterprise-agentic-saas/auth` / `@enterprise-agentic-saas/db` entrypointを importしない。schema exportと `file::memory:` libSQLで起動を軽くする。
- auth/group/permission は happy path だけでなく、unauthorized/forbidden/not found を確認する。
- E2E に行く前に、Elysia `t` schema、service、repository、Elysia handler を Vitest で押さえる。

## 認証・tenant macro

- protected routeは `modules/authorization/access-control.ts` の `authenticated` または `organizationAccess` macroを必ず宣言する。handler内で個別にsession取得するrouteを増やさない。
- `organizationAccess` はroute schemaで検証済みのparams/query/bodyから `organizationId` を取り、session、membership、active organization、role、fresh sessionの順にfail-closedで解決する。
- 非memberによるtenant指定は、存在する他tenantと存在しないIDを区別せず404にする。role不足は403、所属しているがactive tenantが違う場合は409 `active_organization_mismatch`。
- repositoryのtenant resource queryはresource ID単独で検索せず、必ず `organizationId` と組み合わせる。親子resourceはDBのcomposite FKも併用する。
- `super_admin`移管は通常role PATCHから分離し、fresh sessionとtarget member email確認を要求する。移管transaction完了時のsuper_admin数を再確認する。
- `/me` はsessionのactive organizationをmembershipで再検証し、stale/nullなら最新の未失効valid session context、単一membership、nullの順で同一transaction内に永続修復する。`/organizations` は先頭membershipをactive表示するfallbackを持たず、sessionの実値だけを正本にする。
- member削除は対象userの旧tenantを指すsessionも同じtransactionで有効な別organizationまたはnullへreconcileする。

## OpenAPI

- `/openapi` はSwagger UI、`/openapi/json` はOpenAPI 3.0 JSON。Better Auth固有endpointは `/auth/reference` の公式OpenAPIへ誘導する。
- route追加時は `operationId`、summary、description、tag、全request schema、status別response schema、securityを同時に追加する。
- protected routeのsecurity metadataはauth macroから付け、実行時guardとdocumentationが乖離しないようにする。
- error responseは共通 `ApiError` schemaを使う。examplesへ実ID、cookie、token、DB情報を入れない。
- unsafe methodはglobal CSRF guardで`Origin`を必須にし、`CORS_ORIGIN` / `API_PUBLIC_URL`との完全一致だけを許可する。CSRFの403と`csrf_origin_forbidden` exampleを各mutationのOpenAPI responseにも含める。
- resource作成は201へ統一する。このrepoではorganization、invitation、issue、issue commentのPOSTが対象で、実response、route schema、OpenAPI、client testを同時に変更する。

## Auditとtransaction

- organization/member/invitation/todo/comment mutationは `audit_logs` へappend-only eventを残す。
- 重要mutationとaudit insertは同じDB transactionへ入れる。mutation後に別queryでauditを書き、audit失敗時に500を返す実装はretry時の二重操作につながるため禁止。
- organization作成はorganization、super_admin member、audit、既定active session更新を同じtransactionへ含める。
- organization内issue連番は `(organization_id, number)` uniqueを最終防波堤にし、process内organization別queueと、そのunique競合だけを対象にした限定retryを組み合わせる。
- issue commentは`authorId`だけでなく `author: { id, name, image }` を返す。user profileのjoinはcommentの`organizationId`と同じmemberだけに制限し、tenant外または退会済みauthorのname/imageを漏らさずfallback表示にする。

## package 品質

- `apps/api/.oxlintrc.json` は server/Bun 向けに `node`, `promise`, `typescript`, `unicorn`, `oxc`, `import` を使う。
- React/Next/Tailwind/jsx-a11y plugin は `apps/api` へ入れない。
- README には役割、公開 entrypoint、依存方向、env 境界、validation 方針、test 方法を書く。
- API integration test は必須。`app.handle(new Request(...))` で health/auth mount/error response を確認する。

詳細なファイル例が必要なときだけ `references/backend-api.md` を読む。
