---
name: turborepo
description: enterprise-agentic-saas-starterのturbo.json、task graph、cache、outputs、environment、filter、CI taskを変更または診断するときに使う。
---

# Turborepo

## 必読文書

- [システム境界](../../../docs/architecture/system-boundaries.md)
- [品質強制](../../../docs/architecture/quality-enforcement.md)
- [テスト実行契約](../../../docs/testing/README.md)

## Workflow

1. taskのowner workspace、dependency、input、output、environmentを確認する。
2. 実処理はpackage scriptへ置き、root scriptは安定した公開commandだけをdelegateする。
3. cache可能性とsecretの有無を分け、paid/E2E/deploy taskは明示的にcacheを無効化する。
4. dependency graphを`dependsOn`で表し、順序をshell scriptへ隠さない。
5. affected workspaceとroot公開commandの両方を検証する。

## Validation

- `bunx turbo run lint --dry`
- `bunx turbo run typecheck --dry`
- `bun run check`
- CI変更時: `bun run test:e2e`

## 禁止事項

- packageで所有できる処理をroot scriptへ重複実装しない。
- secretをcache key、output、artifactへ含めない。
- `test`へbrowser、external cloud、paid model依存を混ぜない。
- task graphの不備を広い`--filter`やcache無効化で隠さない。
