---
title: 開発者文書の入口
status: accepted
implementation: not-applicable
last_reviewed: 2026-07-25
---

# 開発者文書の入口

## 通常の読む順序

1. [知識管理](architecture/knowledge-management.md)
2. [日本語技術文書の用語・表記基準](jargon.md)
3. [命名とlayer](architecture/naming-and-layers.md)
4. [システム境界](architecture/system-boundaries.md)
5. [対象app/packageのarchitecture](architecture/README.md)
6. [品質強制](architecture/quality-enforcement.md)
7. [テスト戦略](testing/README.md)
8. 製品Agentを変更する場合は[製品Agent仕様](agent/README.md)
9. [Codex harness](architecture/codex-harness.md)
10. [ADR](decisions/README.md)
11. 必要な[active exec plan](exec-plans/README.md)

## 変更作業の開始順序

複雑な変更では通常の索引順ではなく、現在の作業状態から読みます。

1. rootまたは対象directoryの`AGENTS.md`
2. [exec plan一覧](exec-plans/README.md)から対象のactive plan
3. 発火した[local skill](../.agents/local-skills/README.md)
4. skillが指定するarchitecture文書と対象app/package文書
5. skillが指定するtest契約
6. 関連ADR

`docs/agent/`は製品として提供するAgentの機能・security・release受入仕様です。coding agentの
作業harnessは[`docs/architecture/codex-harness.md`](architecture/codex-harness.md)が正本です。
同名の「Agent」を混同しないため、この区別をindexで固定します。

## 文書の責務

| 配置                             | 責務                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| [`docs/jargon.md`](jargon.md)    | 日本語技術文書の用語、表記、例外                              |
| `docs/architecture/`             | directory、dependency、runtime、qualityの規範                 |
| `docs/testing/`                  | test layer、runner、script、実行条件                          |
| `docs/decisions/`                | 長期的な設計判断と代償                                        |
| `docs/exec-plans/`               | 複雑な作業の進捗、判断、検証証跡                              |
| [`docs/agent/`](agent/README.md) | 製品Agentの機能、security、受入仕様                           |
| `.agents/local-skills/`          | skill artifactの編集元。発火条件、必読docs、作業手順、command |
| `AGENTS.md`                      | 全作業に共通する短いcontract                                  |

同じ規範本文を複数の場所へcopyしません。

## 製品・運用文書

次の文書はarchitectureとテスト契約を補う製品仕様、security、運用runbookです。

- [認証・認可・multi-tenant](auth-tenancy-security.md)
- [API / OpenAPI](api-openapi.md)
- [file storage R2](file-storage-r2.md)
- [database lifecycle](database-lifecycle.md)
- [local development](local-development.md)
- [observability](observability.md)
- [deployment operations](deployment-operations.md)
- [upload memory smoke](upload-memory-smoke.md)
