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

## HTTP

- request/response schema
- status、header、request ID
- Auth/tenant macro
- safe field error
- response validation failureは500
- raw cause/private context非公開

## error検証集合

`Error`以外のthrow、getter/Proxy、circular object、secret付きcause、telemetry failureを投入し、error handler自身がthrowしないことを確認します。

## 実行条件

API source変更は`test`を実行します。repository/infrastructure変更はpath mappingによりDB full testも追加します。

## 受入条件

- authorizationをPlaywrightだけで保証しない
- repositoryが実DBで検証される
- error responseにsecret/stackがない
- real HTTP testを必要最小限にする
