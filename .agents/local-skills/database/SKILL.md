---
name: database
description: enterprise-agentic-saas-starterのTurso/libSQL、Drizzle schema、migration、tenant制約、development seedとdatabase lifecycleを変更するときに使う。
---

# Database

## 必読文書

- [DB package設計](../../../docs/architecture/packages/db.md)
- [Database lifecycle](../../../docs/database-lifecycle.md)
- [DBテスト戦略](../../../docs/testing-strategy/packages/db.md)
- tenant変更時: [認証・認可・マルチテナント](../../../docs/auth-tenancy-security.md)

## Workflow

1. schema ownership、tenant key、foreign key、indexとrollback影響を確認する。
2. schema変更後にDrizzleで新しいmigrationとsnapshotを生成する。
3. migration history、fresh DB、upgrade、schema driftを別々に検証する。
4. deterministic seedを再実行可能に保ち、production lifecycleへ混ぜない。
5. `origin/main`に存在するmigrationが不変であることを確認する。

## Validation

- `bun run --cwd packages/db lint`
- `bun run --cwd packages/db typecheck`
- `bun run --cwd packages/db test`
- `bun run --cwd packages/db db:check`
- `git diff --exit-code origin/main -- packages/db/drizzle`

## 禁止事項

- `drizzle-kit push`を使わない。
- `main`に存在するmigrationやsnapshotを変更しない。
- 通常起動でreset、push、seedを暗黙実行しない。
- tenant tableを`organization_id`境界なしで追加しない。
