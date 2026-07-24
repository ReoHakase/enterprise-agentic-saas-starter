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

`routes.ts`から`repository.ts`を直接呼びません。

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
