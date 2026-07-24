---
title: packages/dbの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - packages/db/**
---

# packages/dbの設計

## 責務

Turso/libSQL client、Drizzle schema、migration、development DB tooling、DB test supportを所有します。business repositoryやpermission ruleは所有しません。

## 目標構造

```text
packages/db/
  drizzle/
  src/
    index.ts
    env.ts
    client/
    schema/
    development/
    migrations/
      helpers.ts
      fresh.test.ts
      upgrades.test.ts
      invariants.test.ts
      lifecycle.test.ts
    test-support/
```

## 公開entrypoint

- `@enterprise-agentic-saas/db`
- `@enterprise-agentic-saas/db/schema`
- development用entrypointは明示したものだけ

## 依存関係

他workspaceへ依存しません。schemaからclient、development、fakerをimportしません。

## repositoryとの境界

business repositoryは`apps/api/modules/<module>/repository.ts`へ置きます。DB packageへ置くとuse case ownerが不明になり、すべてのdomainが一つのinfrastructure packageへcoupleするためです。

## migration

`drizzle/`のSQL、snapshot、journalをappend-only historyとしてcommitします。詳細は[テスト戦略](../../testing/database-migrations.md)を参照します。

## テスト

fresh migration、upgrade、constraint、concurrency、seed/reset safetyを`bun run test`で実行します。

## 受入条件

- 他workspace importがゼロ
- business repositoryが存在しない
- migration testが関心ごとに分割されている
- remote seed/resetを拒否する
