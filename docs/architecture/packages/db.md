---
title: packages/dbの設計
status: accepted
implementation: active
last_reviewed: 2026-08-24
applies_to:
  - packages/db/**
---

# packages/dbの設計

## 責務

Turso/libSQL client、Drizzle schema、migration、development DB tooling、DB test supportを所有します。business repositoryやpermission ruleは所有しません。

## 目標構造

```text
packages/db/
  drizzle-v3/    # 単一の基準マイグレーションと将来の追記
  src/
    index.ts
    env.ts
    client/
    schema/
    development/
    migrations/
      helpers.ts
      fresh.test.ts
      invariants.test.ts
      concurrency.test.ts
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

## マイグレーション

マイグレーション履歴は[ADR-006](../../decisions/ADR-006-migration-history-append-only.md)に従います。

- Drizzle v1更新を含む変更では、`drizzle-v3/20260823163505_baseline/`だけを実行対象にします。
  基準マイグレーションは現在のテーブル、列、インデックス、外部キー、検査制約、リポジトリ所有の
  トリガー、明示的にNULLを拒否するテキスト主キー、現在有効なLunaの料金行を一度で作成します。
- 過去の履歴を適用済みのデータベースは支援しません。履歴変換、マイグレーション台帳の移行、既存
  データ補完、マイグレーション接頭辞、二重実行、独自の読み込み処理を持ちません。
- 基準マイグレーションが`main`へ取り込まれた時点から`drizzle-v3/**`を追記専用にします。以後の
  スキーマ変更は`drizzle-v3/<YYYYMMDDHHmmss>_<tag>/{migration.sql,snapshot.json}`を完全な新規
  ディレクトリとして追加します。

新規データベースへの適用、現在の制約とトリガー、並行処理、リセットと任意の開発用初期データ投入を
分けて検証します。詳細は
[DBテスト戦略](../../testing-strategy/packages/db.md)を参照します。

## Drizzle v1とRelations v2

Drizzle ORM、Drizzle Kit、Drizzle Seedは互換する`1.0.0-rc.4`へ完全固定します。DBクライアントは
Drizzle v1のオブジェクト形式で作成し、`client`とRelations v2の`relations`を渡します。
旧コンストラクター、Relations v1、互換実装は持ちません。

`schema/**`はテーブルとRelations v2の定義を所有します。Better Authが生成する
`defineRelationsPart`とアプリケーション固有の`relations`を、同じテーブルの定義を失わないように
統合し、DBクライアントと認証`adapter`へ同じ正本を渡します。

## テスト

新規データベースへの基準マイグレーション、制約、トリガー、現在有効なLunaの料金行、並行処理、
開発用初期データ投入とリセットの安全性を`bun run test`で検証します。履歴とスキーマの不整合は
`bun run db:check`で検出します。

## 受入条件

- 他ワークスペースから内部パスへの直接`import`がない
- 業務リポジトリが存在しない
- `drizzle/**`が存在せず、`drizzle-v3/**`だけが実行対象である
- Drizzle v1更新を含む変更では、単一の基準マイグレーションから現在のスキーマ、トリガー、Lunaの
  料金行を再現できる
- 基準マイグレーションが`main`へ取り込まれた後は既存履歴を変更せず、新しい完全なディレクトリだけを
  追加する
- 過去のデータベース、マイグレーション台帳、既存データを移行する実装がない
- マイグレーションテストが関心ごとに分割されている
- 遠隔データベースへの開発用初期データ投入とリセットを拒否する
