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
| A4 | Elysia HTTP contract | Vitest + `app.handle()` | `test` |
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
