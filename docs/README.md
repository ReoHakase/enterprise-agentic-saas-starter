---
title: 開発者文書の入口
status: proposed
implementation: not-applicable
last_reviewed: 2026-07-24
---

# 開発者文書の入口

## 読む順序

1. [知識管理](architecture/knowledge-management.md)
2. [命名とlayer](architecture/naming-and-layers.md)
3. [システム境界](architecture/system-boundaries.md)
4. [対象app/packageのarchitecture](architecture/README.md)
5. [品質強制](architecture/quality-enforcement.md)
6. [テスト戦略](testing/README.md)
7. [Codex harness](architecture/codex-harness.md)
8. [ADR](decisions/README.md)
9. [active exec plan](exec-plans/active/one-shot-harness-migration.md)

## 文書の責務

| 配置 | 責務 |
| --- | --- |
| `docs/architecture/` | directory、dependency、runtime、qualityの規範 |
| `docs/testing/` | test layer、runner、script、実行条件 |
| `docs/decisions/` | 長期的な設計判断と代償 |
| `docs/exec-plans/` | 複雑な作業の進捗、判断、検証証跡 |
| `.agents/local-skills/` | 発火条件、必読docs、作業手順、command |
| `AGENTS.md` | 全作業に共通する短いcontract |

同じ規範本文を複数の場所へcopyしません。
