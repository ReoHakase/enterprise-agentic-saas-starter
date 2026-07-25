---
title: APIテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-26
applies_to:
  - apps/api/**
related:
  - ../packages/db.md
  - ../packages/auth.md
  - ../packages/email.md
  - ../e2e.md
---

# APIテスト戦略

## 目的

APIでは、ドメイン規則、アプリケーションサービス、DBリポジトリ、HTTP契約、実HTTP transportを分離して検証します。

認可、テナント境界、トランザクション、DB制約、公開エラー形式をPlaywrightだけへ依存させません。実行速度と失敗原因を明確にするため、最も低い十分な層から検査します。

## コード構造との対応

推奨構造:

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

依存方向:

```text
routes
  → service
  → domain
  → ports

service
  → domain
  → ports

repository
  → ports
  → Drizzle/libSQL

module.ts
  → routes
  → service
  → repository

app.ts
  → module.ts
```

禁止:

- routeからrepositoryを直接呼ぶ
- serviceへElysia Context全体を渡す
- domainからElysia、Drizzle、DB packageをimportする
- 別moduleのrepositoryまたはserviceをdeep importする
- APIからWeb、Agent runtime、UIへ依存する

## テスト層

| 名前                                           | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 実物として使うもの                                                                                    | 差し替えるもの                                                        | 対象コード/ファイル                                                                                      | Test Runner                                   | 実行速度           | CI時間課金以外の費用 | 量         |
| ---------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ | -------------------- | ---------- |
| **APIドメイン単体テスト (A1)**                 | 単体                | <ul><li>値の正規化、状態遷移、permission matrixを境界値ごとに確認する</li><li>cursor、date、opaque ID、resource limitのparseと拒否条件を確認する</li><li>冪等性、retry、公開error reasonの分類を確認する</li><li>frameworkやDBなしで同じ入力から同じ結果になることを確認する</li></ul>                                                                                                                                                                                                              | domain function、value object、policy、純粋schema                                                     | clock、ID generator、randomだけを固定する                             | `apps/api/src/modules/**/domain.ts`、`domain/**`、framework非依存の`schema.ts`、`errors`内の純粋registry | Vitest Node                                   | 極めて速い         | なし                 | 非常に多い |
| **APIアプリケーションサービス単体テスト (A2)** | 単体                | <ul><li>認可前にwriteや外部通信を行わないことを確認する</li><li>validation失敗時にrepositoryやproviderを呼ばないことを確認する</li><li>transaction内で必要なoperationだけを正しい順序で実行することを確認する</li><li>重複operation、partial failure、cancel、timeoutを安全に処理することを確認する</li><li>domain errorとprovider errorを公開可能なAppErrorへ変換することを確認する</li></ul>                                                                                                      | service、domain、port interface                                                                       | repository、unit of work、email、R2、external provider、clock、logger | `apps/api/src/modules/**/service.ts`、`application/**`、`ports.ts`、application error mapper             | Vitest Node + fake ports                      | 極めて速いから速い | なし                 | 多い       |
| **APIリポジトリ統合テスト (A3)**               | 統合                | <ul><li>Drizzle queryが必ずtenant predicateを含み、別tenantの存在を漏らさないことを確認する</li><li>FK、unique、check、cascade、transaction、rollbackが実DBで働くことを確認する</li><li>compare-and-swap、pagination order、outbox、lease、fencingを確認する</li><li>競合操作が一意性または業務不変条件を破らないことを確認する</li><li>DB errorをserviceが扱える有限なerrorへ変換することを確認する</li></ul>                                                                                      | 本番Drizzle query、実libSQL、実schema、transaction                                                    | remote Turso、外部provider。必要なclockとIDだけ固定する               | `apps/api/src/modules/**/repository.ts`、`adapters/persistence/**`、DBを使う`infrastructure/**`          | Vitest + in-memoryまたはtemporary-file libSQL | 速いから中         | なし                 | 厚くする   |
| **API HTTP契約統合テスト (A4)**                | 統合                | <ul><li>body、params、query、response schemaが契約どおり検証されることを確認する</li><li>status、request ID、Cache-Control、Retry-After、content typeを確認する</li><li>auth、organization access、CSRF、Origin、CORS前段のmacroとpluginを確認する</li><li>not found、field error、conflict、rate limit、unknown errorの公開形式を確認する</li><li>stack、cause、secret、private contextをresponseへ含めないことを確認する</li><li>OpenAPI operationと実route契約がずれないことを確認する</li></ul> | Elysia app、route、service、schema、error serializer、`app.handle(new Request())`、必要に応じ実libSQL | OAuth provider、email provider、R2、Web search、telemetry backend     | `apps/api/src/modules/**/routes.ts`、`module.ts`、`plugins/**`、`errors/**`、`app.ts`                    | Vitest + Elysia `app.handle()`                | 速いから中         | なし                 | 厚くする   |
| **API実HTTP統合テスト (A5)**                   | 統合                | <ul><li>Web Standard Requestだけでは証明しにくいcookie serialisationと複数Set-Cookieを確認する</li><li>実socket上のCORS、streaming、multipart、client disconnectを確認する</li><li>Eden clientがdate、nullable、error unionをruntimeで正しく受け取ることを確認する</li><li>Service Binding adapterとWorker入口のrequest転送を確認する</li><li>全routeを重複検査せず、transport固有の代表caseだけを確認する</li></ul>                                                                                | ephemeral HTTP server、Eden client、Workerまたはserver adapter、実Request/Response                    | remote DB、production secrets、external provider                      | `apps/api/src/worker.ts`、`client.ts`、`agent-client.ts`、HTTP/stream/multipart adapter、transport test  | Vitest + ephemeral HTTP server                | 中から遅い         | なし                 | 少数       |

## A1: APIドメイン単体テスト

A1はframework非依存でなければなりません。次をimportしません。

- Elysia
- Drizzle ORM
- `@enterprise-agentic-saas/db`
- Email provider
- R2 adapter
- Cloudflare binding
- request context

table-driven testを使い、正常値だけでなく次を優先します。

- 空文字、trim後空文字
- Unicode normalisation
- 最小値、最大値、直前、直後
- nullableとoptionalの区別
- unknown enum
- invalid transition
- actor roleとresource stateの直積
- expired、future、same-time boundary

## A2: APIアプリケーションサービス単体テスト

serviceはElysia Contextではなく明示的なinputとportを受け取ります。

```ts
const service = createIssueService({
  issues: fakeIssueRepository(),
  memberships: fakeMembershipRepository(),
  unitOfWork: fakeUnitOfWork(),
  clock: fixedClock,
})
```

fake repositoryだけでSQL correctnessを証明しません。A2では、call order、call count、input、error mapping、後続処理停止を確認します。

代表的な順序:

```text
validate
  → authenticate
  → authorize
  → reserve idempotency
  → begin transaction
  → write
  → enqueue side effect
  → commit
  → project public result
```

## A3: APIリポジトリ統合テスト

通常caseは`file::memory:`、複数connection、WAL、locking、concurrencyはtemporary file DBを使います。

Drizzle query builderをmockしません。本番と異なるfake DSLを検査しても、実SQL、binding、constraint、transactionを証明できないためです。

`packages/db`との境界:

```text
packages/db
  schema、migration、DB lifecycle、constraint自体

apps/api A3
  業務repositoryのquery、tenant predicate、pagination、error mapping
```

同じconstraintを重複して全面検査するのではなく、package側はDB contract、A3は業務queryがそのcontractを正しく利用することを確認します。

## A4: API HTTP契約統合テスト

`createApp(testDependencies)`と`app.handle()`を標準にします。実HTTP serverを起動せず、Elysiaのschema、macro、plugin、route、serviceを接続できます。

error serializerには通常の`Error`だけでなく、string、`null`、circular object、throwing getter、Proxy、secretを含むcause、telemetry failureを投入します。serializer自身がthrowして元のerrorを隠さないことを確認します。

## A5: API実HTTP統合テスト

A5はtransport固有のcaseへ限定します。A4と同じstatus matrixを全routeで繰り返しません。

A5へ上げる判断:

- `app.handle()`と実socketで挙動が変わる
- browserまたはEden runtimeとのserialisationを確認する必要がある
- stream cancellationまたはmultipart boundaryを確認する必要がある
- Worker binding固有のadapterを通す必要がある

## packageとの責務分担

### `packages/db`

- schema、migration、constraint、seed/reset safetyはDB package
- 業務repositoryとtenant queryはA3

### `packages/auth`

- Better Auth server、cookie、OAuth contractはAuth package
- APIへのmount、API middlewareとのcompositionはA4/A5

### `packages/email`

- template renderとprovider adapterはEmail package
- どの業務条件でどのmail commandを発行するかはA2
- APIからruntime adapterへ正しく接続されるかはA4/A5

## 実行

```sh
bun --cwd apps/api run test
```

A1からA5は、外部cloudと有料providerを使わない範囲で`bun run test`へ含めます。一つのA5 caseが長時間化する場合は、fixture reuse、server reuse、対象caseの限定を先に行い、安易に通常testから外しません。

## 受入条件

- domainがframeworkとDBから独立している
- serviceが明示portを受け取り、Elysia Contextへ依存しない
- tenant境界とDB原子性をE2Eだけで証明していない
- repository testが実libSQLと本番Drizzle queryを使う
- HTTP contractが`app.handle()`で高速に実行される
- 実HTTP caseがtransport固有の少数へ限定される
- unknown errorでもserializerがthrowしない
- package側の責務とAPI consumer integrationが区別される
