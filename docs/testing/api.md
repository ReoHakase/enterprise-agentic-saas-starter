---
title: APIテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - apps/api/**
---

# APIテスト戦略

## テストピラミッド

| layer | 対象                           | runner                           | script     |
| ----- | ------------------------------ | -------------------------------- | ---------- |
| A1    | domain invariant               | Vitest Node                      | `test`     |
| A2    | service + fake port            | Vitest Node                      | `test`     |
| A3    | repository/transaction         | Vitest + libSQL memory/temp file | `test`     |
| A4    | Elysia HTTP / OpenAPI contract | Vitest + `app.handle()`          | `test`     |
| A5    | narrow real HTTP               | Vitest + ephemeral server/Eden   | `test`     |
| A6    | Worker adapter                 | Wrangler dry-run                 | build gate |

## repository

Drizzle query builderをmockしません。実libSQLで次を検証します。

- tenant predicate
- composite FK
- transaction rollback
- unique/check
- CAS
- concurrency
- audit/outbox atomicity

### Organization削除

organization削除はroute、専用guard、service、repository、R2 processorへ分けて検証します。
非`super_admin`、stale session、slugとDELETE確認値の不一致、他tenantの非開示、同一receiptのreplay、
actor-key衝突、tenant cascade、active sessionのnull化、外部keyを持たないcleanup jobの残存、
R2 pagination、lease、backoffを実libSQLとfake storage portで確認します。Playwrightだけで認可、
transactionの原子性、idempotencyを証明しません。

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

実`createApp()`から`/openapi/json`を生成し、別のmetadata registry、YAML/JSON、AST scanner、
巨大snapshotを正本にしません。API-owned testは次を検証します。

- operation IDが存在し重複しない
- declared tag、英語summary 8文字以上、英語description 80文字以上
- `TODO`、`TBD`、機械生成fallback、日本語scriptがsummary/descriptionにない
- operationごとのstandard security、`x-route-status`、`x-auth-context`、`x-audience`
- Better Authの有効routeとconfigured-disabled route、主要なapp-owned route
- private `/internal/agent/**`がpublic documentに出ない
- session cookie、bearer、nullable、`allOf`、multipart、date-time、pagination、error schemaの
  代表contract
- Scalarがauthを永続化せず、telemetryとAgent機能を無効にする

route集合全体を別scannerで再実装せず、追加routeはそのrouteのHTTP testと生成documentの代表assertを
同じPRへ追加します。authorization、tenant、秘密値非漏洩はOpenAPIだけに委ねず、HTTP/service testで
検証します。

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

API source変更は`test`を実行します。通常CIの`bun run test`はDB full testも含めます。

## 受入条件

- authorizationをPlaywrightだけで保証しない
- repositoryが実DBで検証される
- error responseにsecret/stackがない
- real HTTP testを必要最小限にする
- isolated processで取得したElysia routeと両auth modeのBetter Auth operationがOpenAPIと一致する
- Scalar/OpenAPI metadataが詳細な英語で、private routeやsensitive exampleがない
- app-owned説明がElysia `detail`/Valibot metadataにあり、外部YAML/JSON description sourceがない
