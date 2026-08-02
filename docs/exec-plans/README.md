---
title: exec plan運用
status: accepted
implementation: not-applicable
last_reviewed: 2026-08-01
---

# exec plan運用

## 状態

- `draft`: scopeと手順をレビュー中
- `active`: 実行中
- `completed`: 完了条件と証跡を満たした
- `abandoned`: 理由を残して中止

## 必須項目

```text
目的
対象外
関連仕様とADR
前提条件
変更対象path
作業単位
進捗
判断記録
検証証跡
リスクとrollback
完了条件
```

## 運用

- 複雑な作業を開始する前にactive planを作る
- 作業中に進捗、判断記録、検証証跡を更新する
- 完了時に`completed/`へ移す
- task固有の判断が永続化すべき場合はADRへ昇格する

## plan一覧

### 実行中

- [Next devエラー可視化とBetter Auth招待再送修正](active/PLAN-2026-032-development-error-and-invitation-resend.md)
- [Mastra-native Agentリファクタとremote MCP導入](active/agent-refactor-and-mcp.md)
- [Issue-first DataTableとURL同期](active/issue-first-data-table.md)

### 完了

- [CIクリティカルパス短縮](completed/PLAN-2026-031-ci-critical-path-optimization.md)
- [coding agent設定のNix集約](completed/nix-managed-agent-config.md)
- [Emulate対応サービス拡張](completed/emulate-expansion.md)
- [GPT-5.6 Luna有料E2Eの強化](completed/PLAN-2026-030-luna-paid-e2e-hardening.md)
- [標準機能優先のAgent・エラー・可観測性・ブラウザーテスト整理](completed/PLAN-2026-029-standard-library-observability-browser-hardening.md)
- [文書、source構成、品質ゲート、テスト、Codex harnessの全面移行](completed/one-shot-harness-migration.md)

## template

[`template.md`](template.md)を使用します。
