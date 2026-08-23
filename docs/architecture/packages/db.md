---
title: packages/dbの設計
status: accepted
implementation: active
last_reviewed: 2026-08-23
applies_to:
  - packages/db/**
---

# packages/dbの設計

## 責務

Turso/libSQL client、Drizzle schema、migration、development DB tooling、DB test supportを所有します。business repositoryやpermission ruleは所有しません。

## 目標構造

```text
packages/db/
  drizzle/       # 旧形式の不変な証拠
  drizzle-v3/    # ランタイムとツールが使う追記専用の正本
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

## マイグレーション

マイグレーション履歴は[ADR-006](../../decisions/ADR-006-migration-history-append-only.md)に従います。

- `drizzle/**`は、Drizzle 0.xで作成した31件のSQL、スナップショット、ジャーナルを保存する
  読み取り専用の証拠です。`origin/main`とバイト単位で一致させ、ランタイム、テスト、設定、
  運用コマンドから参照しません。
- `drizzle-v3/<YYYYMMDDHHmmss>_<tag>/{migration.sql,snapshot.json}`は、Drizzle v1の
  ランタイムとツールが使う追記専用の正本です。既存ディレクトリを変更せず、スキーマ変更は
  新しい完全なディレクトリとして追加します。
- 旧形式からv3への変換は追跡対象外の一時コピーへ固定版`drizzle-kit up`を実行します。
  変換元31件と変換後31件の時刻、意味名、SQL本文、`--> statement-breakpoint`を照合します。
- 適用済みの旧履歴はDrizzle v1の標準マイグレーターが既存のマイグレーション台帳へ
  `name`と`applied_at`を追加し、`name`を対応付けます。旧行の`applied_at`は`NULL`のまま保持します。
  独自の読み込み処理、二重実行、別台帳を持ちません。

履歴の不変性、新規データベース、途中状態からの更新、台帳の既存データ補完、スキーマ制約を
別々に検証します。詳細は[DBテスト戦略](../../testing-strategy/packages/db.md)を参照します。

## Drizzle v1とRelations v2

Drizzle ORM、Drizzle Kit、Drizzle Seedは互換する`1.0.0-rc.4`へ完全固定します。DBクライアントは
Drizzle v1のオブジェクト形式で作成し、`client`とRelations v2の`relations`を渡します。
旧コンストラクター、Relations v1、互換実装は持ちません。

`schema/**`はテーブルとRelations v2の定義を所有します。Better Authが生成する
`defineRelationsPart`とアプリケーション固有の`relations`を、同じテーブルの定義を失わないように
統合し、DBクライアントと認証`adapter`へ同じ正本を渡します。

## テスト

新規データベースへのマイグレーション、途中状態からの更新、制約、並行処理、開発用初期データ投入と
リセットの安全性を`bun run test`で検証します。履歴とスキーマの不整合は`bun run db:check`で
検出します。

## 受入条件

- 他ワークスペースから内部パスへの直接`import`がない
- 業務リポジトリが存在しない
- `drizzle/**`の利用箇所がなく、`origin/main`とバイト単位で一致する
- `drizzle-v3/**`だけが実行対象で、既存履歴が追記専用である
- 旧31件と変換後31件が1対1で対応する
- Drizzle v1の標準マイグレーターが既存台帳を更新し、適用済みDDLを再実行しない
- マイグレーションテストが関心ごとに分割されている
- 遠隔データベースへの開発用初期データ投入とリセットを拒否する
