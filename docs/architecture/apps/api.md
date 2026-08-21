---
title: apps/apiの設計
status: accepted
implementation: active
last_reviewed: 2026-08-20
applies_to:
  - apps/api/**
---

# apps/apiの設計

## 目次

- [責務](#責務)
- [目標構造](#目標構造)
- [module構造](#module構造)
- [依存方向](#依存方向)
- [Workerキャッシュ境界](#workerキャッシュ境界)
- [error](#error)
- [plugin](#plugin)
- [OpenAPIとScalar](#openapiとscalar)
- [repository](#repository)
- [import境界](#import-boundary)
- [テスト配置](#テスト配置)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 責務

`apps/api`はpublic HTTP、private Agent control plane、authorization、transaction、business repository、OpenAPI、R2 adapter、observabilityを所有します。

本番とローカル開発はCloudflare Workerの`worker.ts`を正本にし、`dist/index.js`を生成する
build/start/deploy経路は持ちません。`index.ts`のBun `listen`は、分離した`file:` DBで実行する
deterministic OAuth E2E fixture専用です。

## 目標構造

```text
apps/api/src/
  app.ts
  index.ts
  worker.ts
  client.ts
  agent-client.ts

  platform/
    env/
    observability/
    plugins/
      openapi.ts

  errors/
    http-error.ts

  modules/
    <module>/
      domain.ts
      schema.ts
      ports.ts
      service.ts
      repository.ts
      routes.ts
      module.ts
      public.ts
      test-support.ts
```

大きいmoduleだけ`domain/`、`application/`、`adapters/http/`、`adapters/persistence/`へ昇格します。

## module構造

| file            | 責務                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `domain.ts`     | pure invariant、state transition、domain error                                  |
| `schema.ts`     | Valibot request/response contractとOpenAPIへ出す英語schema/property description |
| `ports.ts`      | applicationが必要とするoutbound capability                                      |
| `service.ts`    | use case、authorization、transaction orchestration                              |
| `repository.ts` | Drizzle/libSQL adapter                                                          |
| `routes.ts`     | Elysia transport adapterとroute `detail`の英語operation description             |
| `module.ts`     | concrete repositoryとserviceを接続し、routeをElysia appへ登録する               |
| `public.ts`     | 別moduleへ公開する型とuse caseの最小surface                                     |

`routes.ts`から`repository.ts`を直接呼びません。

`app.ts`だけが各moduleの`module.ts`をimportし、各routeをElysia appへ登録します。module Aから
module Bを利用するときは`modules/<b>/public.ts`だけをimportし、`module.ts`、routes、service、
repository、domainのprivate pathへ到達しません。`module.ts`を別moduleへ再exportしません。
`app.ts -> module.ts`だけをcomposition rootの例外とし、module間の変更はpublic entrypoint、
Oxlint、Knipとcode reviewで確認します。

```text
routes -> service -> port <- repository
```

## 依存方向

- `domain`はframeworkとDBをimportしない
- `service`はElysia Context、Drizzle、concrete providerをimportしない
- `repository`はdomain typeとDB schemaをimportできる
- `routes`はschemaとserviceをimportできる
- `module.ts`だけがconcrete repositoryとserviceを接続する
- 別moduleは`public.ts`またはmoduleの公開contractだけをimportする
- `platform`はenv、observability、plugin、app-globalでdomain-neutralなruntime adapterだけを
  所有し、moduleのdomain/serviceへ逆依存しない

別moduleのuse caseを呼ぶ必要がある場合は、consumer applicationがportを所有し、provider moduleの
`public.ts`をadapterで接続します。別moduleのrepositoryやserviceを直接importしてtransaction境界を
横断しません。
module固有portを実装するadapterもowner module内へ置きます。`platform`へ置けるadapterはrequest ID、
telemetry、clock等のapp-global contractに限り、moduleをimportしません。

| importer layer      | 禁止する依存                                                |
| ------------------- | ----------------------------------------------------------- |
| domain              | application、transport、repository、platform、framework、DB |
| application/service | Elysia、Drizzle、concrete provider、concrete repository     |
| transport/routes    | concrete repository、provider SDK、別module private path    |
| platform            | moduleのdomain/service/repository                           |

`app.ts`と各moduleの`module.ts`だけがservice、repository、provider、transportを同時にimportできます。

## Workerキャッシュ境界

- 本番用と互換デプロイ用のWrangler設定は最上位の`cache.enabled=false`を明示する
- 既定入口と名前付き入口の`fetch()`では、Workers Cachingより前にレスポンスを再利用せず、API処理を毎回実行する
- 画像previewは、各モジュールが認証、テナント認可、対象リソース確認を終えた後にだけprivate
  Images WorkerのService Bindingを呼ぶ
- 認証済みfile/Agent asset previewのWorkers CachingとCloudflare Images変換は`apps/images`が
  所有し、APIはそのpreviewにCache APIを利用しない
- 内部requestへAuthorization、cookie、filenameを渡さず、R2 object keyはURLでなく内部headerだけへ置く
- Images Workerのheaderをそのままbrowserへ転送せず、`private, no-cache`、ETag、304、security headerを
  APIで再構築する
- 設定変更から既存キャッシュ項目を自動削除せず、本番導入時に削除要否を別途判断する

## error

`HttpError`は有限な`code`と、必要な場合だけ`cause`、`retryAfter`、明示的に公開可能な`publicMessage`、
`fieldErrors`を持つHTTP境界です。任意のcontextは所有しません。公開文言はアプリケーションが管理する
固定文言またはレビュー済みの入力エラーだけとし、生の例外やprovider応答から作りません。

- domain errorはHTTP statusを持たず、既知の失敗だけを`cause`付き`HttpError`へ1回変換する
- 未知の例外は再生成せず、元の値をElysiaの`onError`まで運ぶ
- statusは固定対応表から決め、本文は`error`、安全な`message`、任意の`fieldErrors`だけにする
- request IDは`x-request-id`、再試行情報は`Retry-After`へ返す
- 4xxは記録せず、5xxは元の例外または`cause`を1回だけ記録する
- 5xxは固定`message`だけを返し、`fieldErrors`、生のmessage、contextを返さない
- error handler内の観測処理が失敗してもレスポンスを壊さない
- 全エラーレスポンスへ`Cache-Control: no-store`を付ける

Better Authルートはライブラリーの標準エラーレスポンスを維持します。

## plugin

- core plugin: request ID、observability、error、CSRF、OpenAPI
- entrypoint plugin: Auth、CORS、server timing
- pluginは名前を持ち、app作成関数からだけ登録する
- serviceへElysia contextを漏らさない
- public appとprivate Agent appを合成しない

## OpenAPIとScalar

`apps/api`はアプリケーション所有の仕様を`/openapi/json`、Better Auth所有の仕様を
`/auth/open-api/generate-schema`から別々に公開し、Scalarを`/openapi`で提供します。詳細な利用者契約は
[API / OpenAPI](../../api-openapi.md)を正本にします。

- `platform/plugins/openapi.ts`はElysiaの`openapi({ documentation, scalar })`を設定する
- アプリケーション所有のrequestとresponseはValibotとElysiaのルートスキーマを正本にする
- アプリケーション所有operationの英語`operationId`、summary、description、tag、`x-*`分類は各ルートの
  `detail`へ書く
- request、response、propertyの英語descriptionは、そのルートへ渡すValibot metadataへ書く
- 全体の`info`、tag、`sessionCookie`、Scalar設定はElysia OpenAPIプラグインへ書く
- Better Authは標準`openAPI`プラグインが生成するOpenAPI 3.1.1をそのまま正本にする
- Scalarの`source`へ2つのURLを指定し、path、component、security schemeを結合しない
- Better Auth仕様のprefix追加、3.0への変換、metadataやsecurityの補正を行わない
- private `/internal/agent/**`と開発・テスト専用ルートをアプリケーション仕様へ含めない
- Scalarは認証値の永続化、telemetry、Agentによるアップロードを無効にする

## repository

- tenant resource queryは`id + organizationId`
- transactionでauditと業務更新を同時に保存する
- DB errorをsafe error taxonomyへmapする
- Drizzle query builderをmockせず、integration testで実libSQLを使う
- business repositoryを`packages/db`へ移さない

Issues一覧の複数status、priority範囲、複数assignee、labelのAny/All、期日範囲、page sizeは
route modelからservice inputへ明示してrepositoryで組み立てます。titleとdescriptionの部分一致では
`%`と`_`をliteralとしてescapeします。statusとpriorityのsortは表示上のdomain順をSQLで固定し、
同順位は既存の安定tie-breakerを使います。Webが期日の表示範囲と検証済みの
`dueDateFromOffsetMinutes`と`dueDateToExclusiveOffsetMinutes`を送った場合、リポジトリは範囲開始と
終了日翌日のlocal calendar境界をそれぞれUTC instantへ変換します。旧`dueDateOffsetMinutes`は両境界の
fallbackとして受理します。Webは1か月のrange Calendarで選択した日付境界を送り、APIはpreset名を
受理しません。query modelは未知keyを拒否するため、旧`dueDatePreset`を含むrequestは400を返します。
日時範囲は`due_date IS NOT NULL`の行だけを対象にします。

label候補はIssue一覧とは別のtenant-scoped endpointで返します。organization membershipをserviceで確認し、
repositoryは`organization_id`境界内のJSON labelを大文字小文字を区別せずdistinct化します。検索時は
prefix一致を先、次にname順とし、件数は50へ制限します。利用件数や人気順はcontractに含めません。

## import boundary

禁止:

```text
apps/web/**
apps/agent/**
@enterprise-agentic-saas/ui/**
@enterprise-agentic-saas/emulate/**
別moduleのrepository/service private path
```

`platform/**`からdomain moduleへの逆依存も禁止します。

`no-restricted-imports`はworkspace禁止patternと合成し、moduleのpublic entrypoint、Knip strict、
package-owned testと合わせて境界を検査します。test fileも別module private pathへ抜けません。

## テスト配置

- domain/service: Vitest Node
- repository: Vitest + in-memory/temp libSQL
- HTTP: `app.handle(new Request())`
- OpenAPI: Elysia route + 両auth modeの実generated schema + 最終document/runtime parity
- narrow real HTTP: date/cookie/stream contractだけ
- Worker bundle: Wrangler dry-run

全てreal browserを必要としないため`bun run test`へ含めます。

## 理由と代償

### 理由

- Elysia型推論を維持しながらrouteを薄くする
- DBとHTTPからbusiness ruleを隔離する
- repositoryを実DBで検証し、mockの偽陽性を避ける
- Better Authの実生成スキーマを使い、ライブラリー更新と実行時契約の不整合を検出する
- アプリケーションルートの実装、検証、英語OpenAPI説明を同じElysiaモジュールでレビューできる
- Scalarの複数仕様機能へ委譲し、結合と変換の保守をなくす

### 代償

- moduleの接続codeが増える
- error mappingを明示する必要がある
- 利用者はScalar上でアプリケーションAPIと認証APIを切り替える
- 小さいmoduleではfile数が増える

小さいmoduleはflat構造を維持し、責務のないdirectoryは作りません。

## 受入条件

- routeからrepository直接callがない
- serviceへElysia Contextを渡さない
- domainからElysia/Drizzle importがない
- tenant queryにorganizationIdがある
- raw error messageがHTTPへ出ない
- public/private Agent appが分離されている
- `/openapi/json`にアプリケーション所有ルートだけが1回ずつ存在する
- Better Auth仕様が標準生成ルートから独立して取得できる
- Scalarが2つの仕様を参照し、private routeやcredentialの例を含まない
- アプリケーションルートの説明がElysia `detail`とValibot metadataにあり、外部YAML/JSONの説明元がない
