---
title: ADR運用
status: accepted
implementation: not-applicable
last_reviewed: 2026-08-01
---

# ADR運用

## 目的

長期的な設計判断を、理由、代替案、強制方法とともに残します。

## 状態

- `proposed`
- `accepted`
- `superseded`

`accepted` ADRの意味を直接書き換えず、新しいADRで置き換えます。

## 必須項目

```text
背景
決定
理由
検討した代替案
結果
強制方法
検証
```

## 今回のADR

- [ADR-001 docsとskillsの正本](ADR-001-docs-and-skills-source-of-truth.md)
- [ADR-002 layerとimport boundary](ADR-002-layering-and-import-boundaries.md)
- [ADR-003 test commandとcost layer](ADR-003-test-command-and-cost-model.md)
- [ADR-004 Codex独立review（ADR-011で置換済み）](ADR-004-codex-independent-review.md)
- [ADR-005 Agent runtimeのsrc/mastra集約](ADR-005-agent-runtime-under-src-mastra.md)
- [ADR-006 migration history append-only](ADR-006-migration-history-append-only.md)
- [ADR-007 workspace別テスト戦略](ADR-007-workspace-testing-strategy.md)
- [ADR-008 Mastra-native Agent runtimeと専用Storage（耐久確定処理の判断はADR-012で一部置換）](ADR-008-mastra-native-agent-runtime.md)
- [ADR-009 MCPをAPIへ配置しOAuth認証でbusiness toolを直接実行する](ADR-009-mcp-authentication-and-direct-tools.md)
- [ADR-010 local observabilityをOpenTelemetryと共有LGTMへ統一する（生エラーの保存面はADR-013で一部置換）](ADR-010-local-opentelemetry-lgtm.md)
- [ADR-011 coding agentのskillとMCP設定をNixで管理する](ADR-011-nix-managed-agent-config.md)
- [ADR-012 Mastra MemoryとBetter Authの標準機能を独自耐久化より優先する](ADR-012-standard-memory-and-auth-delivery.md)
- [ADR-013 固定ローカル環境の生エラーをLogsだけへ保存する](ADR-013-local-raw-errors-in-logs-only.md)
