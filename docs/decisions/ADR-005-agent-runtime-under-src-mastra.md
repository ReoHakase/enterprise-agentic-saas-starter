---
id: ADR-005
title: Agent runtimeのsrc/mastra集約
status: proposed
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
---
# ADR-005 Agent runtimeのsrc/mastra集約

## 背景

Agent codeが`src/mastra`と他の`src/*`へ分散すると、Studio、Worker、test、import gateの探索範囲が曖昧になります。

## 決定

Generated Cloudflare型を除くhand-written Agent runtimeを`apps/agent/src/mastra/**`へ集約します。
framework-independent codeも`src/mastra/core/**`へ置き、dependency ruleでMastra/providerから
隔離します。production/Studioは同じcomposition、scripted modelは別E2E entrypointを使います。
物理構造とlegacy retentionは[apps/agentの設計](../architecture/apps/agent.md)に定義します。

## 理由

Mastra固有のownershipを一つのrootへ閉じ、legacy zoneをgate対象外にしないためです。

## 検討した代替案

- `src/core`と`src/mastra`を並立: framework-independent coreは明確だがrepositoryの探索範囲が分散する
- 現状維持: import ruleとtest ownershipが曖昧

## 結果

Path変更が大きくなり、一度の全面refactorが必要です。`src/mastra/core`でframework-independent codeを保ちます。
旧`IssueAssistant`は`src/mastra/legacy/issue-assistant.ts`へ隔離し、class exportと既存
`new_sqlite_classes`を保持します。別retention判断まで`deleted_classes`を追加しません。

## 強制方法

- production source root check
- Oxlint path rule
- old path不在check

## 検証

- `find apps/agent/src`でgenerated typeと`mastra`以外のhand-written sourceがない
- production/E2E Worker build
- Studio smoke
