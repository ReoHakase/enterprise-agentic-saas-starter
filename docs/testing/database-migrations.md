---
title: Drizzle migrationのテストと運用
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - packages/db/src/schema/**
  - packages/db/drizzle/**
  - packages/db/src/migrations/**
---

# Drizzle migrationのテストと運用

## 目次

- [現在の強み](#現在の強み)
- [決定](#決定)
- [テストファイル](#テストファイル)
- [fresh migration](#fresh-migration)
- [upgrade migration](#upgrade-migration)
- [invariant検証](#invariant検証)
- [lifecycle検証](#lifecycle検証)
- [schema drift検査](#schema-drift検査)
- [履歴検査](#履歴検査)
- [changed実行](#changed実行)
- [CI](#ci)
- [本番運用](#本番運用)
- [受入条件](#受入条件)

## 現在の強み

既存suiteはfresh migration、historical prefix upgrade、legacy data backfill、trigger、FK、constraint、concurrency、seed/reset safetyを実libSQLで検証しています。この保証は維持します。

## 決定

巨大な`migrations.test.ts`を次へ分割します。

```text
packages/db/src/migrations/
  helpers.ts
  fresh.test.ts
  upgrades.test.ts
  invariants.test.ts
  lifecycle.test.ts
```

Migrationごとに一fileへ分けず、関心ごとに4suite程度へ整理します。

## テストファイル

- `helpers.ts`: migration folder、tag prefix、DB factory、cleanup
- `fresh.test.ts`: empty DBからcurrent
- `upgrades.test.ts`: representative historical stateからcurrent
- `invariants.test.ts`: FK、unique、check、trigger、concurrency
- `lifecycle.test.ts`: seed、reset、remote/production refusal

## fresh migration

検証:

- 全migration適用
- expected table/index/trigger
- `pragma foreign_key_check`
- current schemaで基本insert/update/delete
- migration ledger件数

## upgrade migration

historical cutoffはjournal indexではなくtagで指定します。

```ts
const prefix = await createMigrationPrefix({
  through: "0016_agent_messages",
})
```

各test:

1. prefixまでmigrate
2. representative legacy row投入
3. currentまでmigrate
4. data、count、constraint、trigger検証
5. current migrateを再実行
6. current repository operationを一つ実行

## invariant検証

- tenant composite FK
- one super admin
- pending invitation unique
- outbox ownership
- idempotency
- profile image state
- file claim/quota
- file DB concurrency

## lifecycle検証

- local URLだけseed/reset可
- production拒否
- remote Turso拒否
- resetがmigration ledgerから再構築
- seedがtransactional、deterministic、non-destructive

## schema drift検査

三つを別gateにします。

1. `drizzle-kit check`: history consistency
2. temporary outputへの`drizzle-kit generate`: schemaに未生成diffがない
3. Vitest migration suite: behaviour

`db:check`だけでschema driftを保証したとみなしません。

## 履歴検査

`main`に存在するSQL、snapshot、journal entryはappend-onlyです。

- current PRで追加した新規migrationはmerge前だけ修正可能
- main上のmigrationを修正せず、新しいrepair migrationを追加
- DBのmigration ledgerは適用状況の証跡であり、history書換えの許可証ではない
- release manifestや未deploy証跡による例外を設けない

この規則はreviewerの主観を排除します。

## changed実行

Migration fileはmodule graph外で`readFile`されるため、Vitest configへ追加します。

```ts
forceRerunTriggers: [
  "drizzle/**",
  "src/schema/**",
  "drizzle.config.ts",
]
```

API repository/infrastructure変更でも通常CIの`bun run test`によりDB full suiteを実行します。

## CI

```text
migration-history
schema-drift
migration-behaviour
```

Quality jobの最初にhistory/driftを実行し、`bun run test`でbehaviourを実行します。

## 本番運用

- backup/restore確認
- deploy concurrency 1
- API deploy前にmigrationを一度適用
- expand/contract
- `/ready`、Auth、tenant smoke
- seedをproduction provisioningに使わない

## 受入条件

- migration testが5file以内の関心ごとへ分割
- tagでhistorical cutoffを指定
- main migrationが変更されない
- schema drift gateがある
- API repository変更でDB full suiteが走る
- `bun run test`でmigration behaviourが検証される
