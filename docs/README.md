---
title: 開発者文書の入口
status: proposed
implementation: not-applicable
last_reviewed: 2026-07-24
---

# 開発者文書の入口

## 通常の読む順序

1. [知識管理](architecture/knowledge-management.md)
2. [命名とlayer](architecture/naming-and-layers.md)
3. [システム境界](architecture/system-boundaries.md)
4. [対象app/packageのarchitecture](architecture/README.md)
5. [品質強制](architecture/quality-enforcement.md)
6. [テスト戦略](testing/README.md)
7. 製品Agentを変更する場合は[製品Agent仕様](agent/README.md)
8. [Codex harness](architecture/codex-harness.md)
9. [ADR](decisions/README.md)
10. 必要な[active exec plan](exec-plans/README.md)

## 変更作業の開始順序

複雑な変更では通常の索引順ではなく、現在の作業状態から読みます。

1. rootまたは対象directoryの`AGENTS.md`
2. 対象の[active exec plan](exec-plans/active/one-shot-harness-migration.md)
3. 発火した[local skill](../.agents/local-skills/README.md)
4. skillが指定するarchitecture文書と対象app/package文書
5. skillが指定するtest契約
6. 関連ADR

`docs/agent/`は製品として提供するAgentの機能・security・release受入仕様です。coding agentの
作業harnessは[`docs/architecture/codex-harness.md`](architecture/codex-harness.md)が正本です。
同名の「Agent」を混同しないため、この区別をindexで固定します。

## 文書の責務

| 配置 | 責務 |
| --- | --- |
| `docs/architecture/` | directory、dependency、runtime、qualityの規範 |
| `docs/testing/` | test layer、runner、script、実行条件 |
| `docs/decisions/` | 長期的な設計判断と代償 |
| `docs/exec-plans/` | 複雑な作業の進捗、判断、検証証跡 |
| [`docs/agent/`](agent/README.md) | 製品Agentの機能、security、受入仕様 |
| `.agents/local-skills/` | skill artifactの編集元。発火条件、必読docs、作業手順、command |
| `AGENTS.md` | 全作業に共通する短いcontract |

同じ規範本文を複数の場所へcopyしません。

## 現行の製品・運用文書

全面移行のtarget architectureとは別に、現在の実装・運用を失わないため次も索引へ含めます。

- [現行architecture](architecture.md)
- [認証・認可・multi-tenant](auth-tenancy-security.md)
- [API / OpenAPI](api-openapi.md)
- [file storage R2](file-storage-r2.md)
- [database lifecycle](database-lifecycle.md)
- [現行test実装runbook](testing.md)
- [local development](local-development.md)
- [observability](observability.md)
- [deployment operations](deployment-operations.md)
- [upload memory smoke](upload-memory-smoke.md)
