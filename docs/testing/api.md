---
title: APIテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - apps/api/**
---

# APIテスト戦略

## テストピラミッド

| layer | 対象 | runner | script |
| --- | --- | --- | --- |
| A1 | domain invariant | Vitest Node | `test` |
| A2 | service + fake port | Vitest Node | `test` |
| A3 | repository/transaction | Vitest + libSQL memory/temp file | `test` |
| A4 | Elysia HTTP / OpenAPI contract | Vitest + `app.handle()` | `test` |
| A5 | narrow real HTTP | Vitest + ephemeral server/Eden | `test` |
| A6 | Worker adapter | Wrangler dry-run | build gate |

## repository

Drizzle query builderをmockしません。実libSQLで次を検証します。

- tenant predicate
- composite FK
- transaction rollback
- unique/check
- CAS
- concurrency
- audit/outbox atomicity

## application

serviceはfake portで次を検証します。

- authorizationとtenant contextを最初に確認する
- portのcall orderと引数
- duplicate/idempotency
- transaction途中のfailureとrollback projection
- cancellation/timeoutの伝播
- failure時に後続write、usage、notificationを呼ばない

## HTTP

- request/response schema
- status、header、request ID
- Auth/tenant macro
- safe field error
- response validation failureは500
- raw cause/private context非公開

## OpenAPI contract

A4は簡略化した5-route fixtureではなく、GitHub plugin topologyとOAuth emulator modeをそれぞれ
fresh subprocess/matrix process、isolated module graph、temporary DB、synthetic credentialで起動し、
実Better Auth schemaを生成して検証します。environmentだけを書き換えた同一processでauth singletonを
再利用しません。

- public API appへ登録された`detail.hide: true`でないElysia operationをcodeから取得する
- Better Auth raw generated operationを各modeの`generateOpenAPISchema()`から取得する
- 二集合の和とOpenAPI `METHOD + normalized path`がexactly once
- implicit HEAD/OPTIONS、wildcard handlerをdocumentable operationへ数えない
- private `/internal/agent/**`、development/test routeのabsence
- Better AuthのElysia OpenAPI plugin内の補足keyが実生成operation/schemaへexactly once一致し、
  missing/stale keyがない
- unique operation ID、declared tag、英語summary/description/response/property metadata
- app-owned operationの説明がElysia route `detail`、request/response/property説明がそのrouteへ渡す
  Valibot schema metadataから生成される
- `**/{openapi,swagger}.{yaml,yml,json}`、`**/*.{openapi,swagger}.{yaml,yml,json}`、
  `apps/api/**/{metadata,descriptions,operations,schemas,paths}.{yaml,yml,json}`が、後述のfixture以外にない
- `apps/api/**/{openapi-metadata,openapi-descriptions,operation-metadata,schema-metadata,route-inventory}.*`
  が、後述のfixture以外にない
- AST検査で、人向けmetadataがElysia route `detail`、routeが使うValibot metadata、
  Elysia OpenAPI plugin以外から供給されない
- `apps/api/test/openapi-fixtures/**`はnegative testだけに使い、production import graphに入らない
- operationごとのstandard security、`x-route-status`、`x-auth-context`、`x-audience`
- configured-disabled email/password系routeを利用可能と誤記しない
- success/error status、media type、request/response schema
- OpenAPI 3.0.3 validator、dangling `$ref`、3.1 keyword残留、allowlisted nullable/`allOf`変換と
  unsupported keyword/type unionのJSON Pointer付きreject
- Scalarが`/openapi/json`を読み、auth永続化、telemetry、Agent/uploadを無効にする
- `/auth/reference`が404
- final documentの`example` / `examples` / `default` / header/cookie/security exampleを再帰走査し、
  token、credential、Authorization、known secret、non-reserved email/domain、private ID/URL、
  provider/DB raw errorを拒否する

人向けmetadataの英語検査はwhitespaceを正規化し、summaryへASCII letterと8文字以上、
operation descriptionへ80文字以上、response/schema/property descriptionへ12文字以上、
`info`/tag/security scheme descriptionへ20文字以上を要求します。`TODO`、`TBD`、`placeholder`、
機械生成fallback、日本語scriptを拒否します。`info.title`とtag nameは空文字と日本語だけを拒否します。
検査対象fieldを限定し、Unicodeのrequest example、regex、enum、property nameを誤検出しません。
文字数は詳細さを証明しないため、route分類ごとに必要な認証、tenant、side effect、idempotency、
pagination、quota等が説明されているかはAPI reviewでも確認します。

巨大なJSON snapshotだけに依存せず、route集合、metadata、schema normalization、Scalar configを
分けてassertします。

leakage testはvalue-bearing fieldだけを対象にし、reserved domain、`.test`、version管理したsynthetic
sentinelだけを許可します。GitHub plugin topologyとOAuth emulatorで生成した最終documentへ同じ
scannerを実行します。

代表runtime parityはpublic sign-in/callback、session-required route、disabled email/password、
recipient organization、blocked organizationを対象にします。library routeのstatus/securityを
app conventionへ無条件に書き換えず、実responseと生成documentの一致を確認します。

## error検証集合

次をtable-drivenに投入し、error handler自身がthrowしないことを確認します。

- string、number、`null`、plain object
- throwing getter、Proxy、circular object、`__proto__`
- 極端に長いmessage、invalid status/code
- secret付きcause、raw provider/DB response
- abort、dependency timeout、local rate limit
- telemetry/Sentry自身のthrow

全caseでsecret、stack、cause、private context、provider本文を返さず、request ID、
`Cache-Control: no-store`、有限error codeを返します。`Retry-After`はregistryでretryableと定義した
429/503だけへ付け、Sentry attributeはallowlistだけを送ります。

## real HTTPを使う範囲

`app.handle()`で表現できない次だけをephemeral HTTPで検証します。

- cookieとCORS/Origin
- streaming/backpressure/disconnect
- multipart body

business rule、schema、authorization matrixをreal serverへ重複させません。
Service Binding、named entrypoint、workerd固有adapter behaviorは通常のBun/Elysia serverで再現せず、
free full-stack E2とCloudflare dry-runへ置きます。A6 dry-runはbundle/configの静的成立を確認し、
実際のrequest behaviorはE2が担当します。

## 実行条件

API source変更は`test`を実行します。repository/infrastructure変更はpath mappingによりDB full testも追加します。

## 受入条件

- authorizationをPlaywrightだけで保証しない
- repositoryが実DBで検証される
- error responseにsecret/stackがない
- real HTTP testを必要最小限にする
- isolated processで取得したElysia routeと両auth modeのBetter Auth operationがOpenAPIと一致する
- Scalar/OpenAPI metadataが詳細な英語で、private routeやsensitive exampleがない
- app-owned説明がElysia `detail`/Valibot metadataにあり、外部YAML/JSON description sourceがない
