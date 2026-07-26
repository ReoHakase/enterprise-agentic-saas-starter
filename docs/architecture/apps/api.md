---
title: apps/apiの設計
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/api/**
---

# apps/apiの設計

## 目次

- [責務](#責務)
- [目標構造](#目標構造)
- [module構造](#module構造)
- [依存方向](#依存方向)
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
    openapi/
      normalize-auth-schema.ts

  errors/
    app-error.ts
    error-registry.ts

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

## error

`AppError`はHTTPへ公開してよい情報のmarkerです。

改善後の原則:

- error codeをfinite registryへする
- callerが任意のpublic messageを組み立てない
- raw provider/DB errorは`cause`とprivate contextへ閉じる
- 4xxと5xxのcapture policyをregistryで定義する
- error handler内のtelemetry failureでresponseを壊さない
- responseへ`Cache-Control: no-store`とrequest IDを付ける
- validation field pathをallowlistする

`domain` errorはHTTP statusを持たず、application/transport boundaryで`AppError`へmapします。

Dependency failureはadapterで次の有限taxonomyへmapし、message文字列検索で分類しません。

| failure                   | HTTP projection | 備考                             |
| ------------------------- | --------------: | -------------------------------- |
| upstream rejected request |             502 | providerのraw本文は非公開        |
| dependency unavailable    |             503 | retry可能な場合だけ`Retry-After` |
| dependency timeout        |             504 | caller abortと区別する           |
| local rate/budget limit   |             429 | local policyの有限code           |
| caller cancellation       |     request中断 | 500としてcaptureしない           |
| programming bug / unknown |             500 | safe messageだけ返す             |

domain errorにはHTTP statusを持たせません。adapterがtyped status/codeを受け取り、transportが
registryからstatus、public message、capture policyを決めます。既存serviceを一律に`Result`型へ
移すことは要求せず、期待されるfailureを明示した方が安全なboundaryだけでtyped resultを使います。

## plugin

- core plugin: request ID、observability、error、CSRF、OpenAPI
- entrypoint plugin: Auth、CORS、server timing
- pluginは名前を持ち、app作成関数からだけ登録する
- serviceへElysia contextを漏らさない
- public appとprivate Agent appを合成しない

## OpenAPIとScalar

`apps/api`はapp-owned routeとBetter Auth/library routeを一つの`/openapi/json`へ統合し、Scalarを
`/openapi`で提供します。詳細なconsumer contractは[API / OpenAPI](../../api-openapi.md)を正本にします。

- `platform/plugins/openapi.ts`はElysiaの`openapi({ documentation, scalar })`を設定する
- `platform/openapi/normalize-auth-schema.ts`はBetter Authの3.1 fragmentを3.0.3へ変換するだけで、
  人向けdescriptionを所有しない
- app-owned request/responseはValibot/Elysia route schemaを正本にする
- app-owned operationの英語`operationId`、summary、description、tag、`x-*`分類は各Elysia routeの
  `detail`へ書く
- request/response全体とpropertyの英語descriptionは、そのrouteへ渡すValibot schema metadataへ書く
- Better Authは有効pluginから実生成したschemaを正本にし、body/responseを手書きで複製しない
- global `info`、tag/security scheme description、Scalar設定はElysia OpenAPI pluginへ書く
- Better Authの生成fragmentはElysia OpenAPI plugin内でprefix付与、normalization、英語metadata/security
  の補足を行い、Elysia `openapi({ documentation })`へ渡す
- public API appのElysia route、各modeのBetter Auth実生成operation、最終OpenAPIの和集合を検証する
- GitHub plugin topologyとOAuth emulator modeをfresh processで別々に検証する
- libraryが登録するがproduct policyで無効なrouteは`x-route-status: configured-disabled`と明示する
- private `/internal/agent/**`、development/test routeをpublic documentへ含めない
- OpenAPIの説明をYAML/YML/JSON、生成済みspec、独立metadata registryへ書かない

repo向けsource commentと規範文書は日本語でよいですが、Scalarへ出る`info`、tag、summary、
description、response、security、schema/propertyの人向け文言は詳細な英語にします。fallbackで
`GET auth / path`のような機械生成文言を本番documentへ残しません。

OpenAPI normalizationはBetter AuthのOpenAPI 3.1 fragmentの明示allowlist subsetだけを
semantics-preservingに3.0.3へ変換し、未対応keyword/type unionはJSON Pointer付きで起動/testを
fail-fastします。raw generated securityを一律に信用せず、public callback、
session-required、cookie/bearer等の実runtimeをElysia OpenAPI plugin内でoperation単位に補足します。
Scalarはauth永続化、telemetry、Agent/uploadを無効にし、credentialやPIIをexampleへ埋め込みません。

## repository

- tenant resource queryは`id + organizationId`
- transactionでaudit/outboxを同時に保存する
- DB errorをsafe error taxonomyへmapする
- Drizzle query builderをmockせず、integration testで実libSQLを使う
- business repositoryを`packages/db`へ移さない

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
- Better Authの実生成schemaを使い、library upgradeとruntime contractのdriftを検出する
- app routeの実装、validation、英語OpenAPI説明を同じElysia moduleでreviewできる
- consumer品質のためにBetter Auth routeを手で複製せず、Elysia OpenAPI pluginで生成結果を補足する

### 代償

- moduleの接続codeが増える
- error mappingを明示する必要がある
- Better Auth upgrade時にElysia OpenAPI pluginのmetadata/security補足を見直す必要がある
- 小さいmoduleではfile数が増える

小さいmoduleはflat構造を維持し、責務のないdirectoryは作りません。

## 受入条件

- routeからrepository直接callがない
- serviceへElysia Contextを渡さない
- domainからElysia/Drizzle importがない
- tenant queryにorganizationIdがある
- raw error messageがHTTPへ出ない
- public/private Agent appが分離されている
- public/library routeとOpenAPI operationがexactly once一致する
- Scalar consumer metadataが詳細な英語で、private routeやcredential exampleがない
- app routeの説明がElysia `detail`とValibot metadataにあり、外部YAML/JSON description sourceがない
