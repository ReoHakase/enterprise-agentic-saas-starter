---
id: ADR-004
title: Codex独立review
status: accepted
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
---

# ADR-004 Codex独立review

## 背景

同じagentが実装と最終reviewを行うと、自身の仮定と見落としを引き継ぎます。

## 決定

`implementer`を唯一のwriterとし、correctness、security、testsを別のread-only custom agentでreviewします。

## 理由

Contextと責務を分離し、review findingをevidence付きで構造化するためです。

## 検討した代替案

- self-reviewだけ: 独立性がない
- 複数writer: 同じworktreeで競合する
- hookだけでreview強制: client/trust状態に依存する

## 結果

Token使用量とworkflow時間が増えます。Read-onlyは実測probeで検証します。

## 強制方法

- AGENTS mandatory workflow
- custom agent sandbox
- Rules
- current headでre-review

## 検証

- reviewer write-denial probe
- P0/P1 findingのwaiver不可
- review outputのbase/head一致
