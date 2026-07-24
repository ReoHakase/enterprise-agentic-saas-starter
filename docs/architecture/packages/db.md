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

runtime/sourceから他workspaceへ依存しません。共有TypeScript config等のtoolingは
`devDependency`として利用できますが、source importやproduction dependencyにしません。
schemaからclient、development、fakerをimportしません。
`schema/**`はDrizzle schemaとpure DB contractだけを所有し、environment、network、seed、
business permission、client connectionを参照しません。`development/**`と`test-support/**`は
production entrypointから到達不能にし、development用途は明示subpathだけで公開します。

## repositoryとの境界

business repositoryは小さいmoduleでは`apps/api/src/modules/<module>/repository.ts`、昇格した
moduleでは`apps/api/src/modules/<module>/adapters/persistence/**`へ置きます。DB packageへ置くと
use case ownerが不明になり、すべてのdomainが一つのinfrastructure packageへcoupleするためです。

## migration

`drizzle/`のSQL、snapshot、journalをappend-only historyとしてcommitします。詳細は[テスト戦略](../../testing/database-migrations.md)を参照します。

## テスト

fresh migration、upgrade、constraint、concurrency、seed/reset safetyを`bun run test`で実行します。

## 受入条件

- 他workspace importがゼロ
- business repositoryが存在しない
- migration testが関心ごとに分割されている
- remote seed/resetを拒否する
