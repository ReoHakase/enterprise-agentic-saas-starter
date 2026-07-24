---
title: apps/apiの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
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

| file | 責務 |
| --- | --- |
| `domain.ts` | pure invariant、state transition、domain error |
| `schema.ts` | Valibot request/response contract |
| `ports.ts` | applicationが必要とするoutbound capability |
| `service.ts` | use case、authorization、transaction orchestration |
| `repository.ts` | Drizzle/libSQL adapter |
| `routes.ts` | Elysia transport adapter |
| `module.ts` | composition root |
| `public.ts` | 別moduleへ公開する型とuse caseの最小surface |

`routes.ts`から`repository.ts`を直接呼びません。

`app.ts`だけが各moduleの`module.ts`をimportし、Elysia appへcompositionします。module Aから
module Bを利用するときは`modules/<b>/public.ts`だけをimportし、`module.ts`、routes、service、
repository、domainのprivate pathへ到達しません。`module.ts`を別moduleへ再exportしません。
architecture fixtureは`app.ts -> module.ts`を許可し、`module A -> module B/public.ts`以外を
拒否します。

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

| importer layer | 禁止する依存 |
| --- | --- |
| domain | application、transport、repository、platform、framework、DB |
| application/service | Elysia、Drizzle、concrete provider、concrete repository |
| transport/routes | concrete repository、provider SDK、別module private path |
| platform | moduleのdomain/service/repository |

composition rootだけがservice、repository、provider、transportを同時にimportできます。

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

| failure | HTTP projection | 備考 |
| --- | ---: | --- |
| upstream rejected request | 502 | providerのraw本文は非公開 |
| dependency unavailable | 503 | retry可能な場合だけ`Retry-After` |
| dependency timeout | 504 | caller abortと区別する |
| local rate/budget limit | 429 | local policyの有限code |
| caller cancellation | request中断 | 500としてcaptureしない |
| programming bug / unknown | 500 | safe messageだけ返す |

domain errorにはHTTP statusを持たせません。adapterがtyped status/codeを受け取り、transportが
registryからstatus、public message、capture policyを決めます。既存serviceを一律に`Result`型へ
移すことは要求せず、期待されるfailureを明示した方が安全なboundaryだけでtyped resultを使います。

## plugin

- core plugin: request ID、observability、error、CSRF、OpenAPI
- entrypoint plugin: Auth、CORS、server timing
- pluginは名前を持ち、compositionに閉じる
- serviceへElysia contextを漏らさない
- public appとprivate Agent appを合成しない

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
@enterprise-agentic-saas/github-emulator/**
別moduleのrepository/service private path
```

`platform/**`からdomain moduleへの逆依存も禁止します。

`no-restricted-imports`とarchitecture checkはdomain/application/transport/platformを別々に検査し、
workspace禁止patternと合成します。test fileも別module private pathへ抜けません。

## テスト配置

- domain/service: Vitest Node
- repository: Vitest + in-memory/temp libSQL
- HTTP: `app.handle(new Request())`
- narrow real HTTP: date/cookie/stream contractだけ
- Worker bundle: Wrangler dry-run

全てreal browserを必要としないため`bun run test`へ含めます。

## 理由と代償

### 理由

- Elysia型推論を維持しながらrouteを薄くする
- DBとHTTPからbusiness ruleを隔離する
- repositoryを実DBで検証し、mockの偽陽性を避ける

### 代償

- module composition codeが増える
- error mappingを明示する必要がある
- 小さいmoduleではfile数が増える

小さいmoduleはflat構造を維持し、責務のないdirectoryは作りません。

## 受入条件

- routeからrepository直接callがない
- serviceへElysia Contextを渡さない
- domainからElysia/Drizzle importがない
- tenant queryにorganizationIdがある
- raw error messageがHTTPへ出ない
- public/private Agent appが分離されている
