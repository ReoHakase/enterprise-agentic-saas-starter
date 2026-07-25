---
id: ADR-001
title: docsとskillsの正本
status: accepted
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
---
# ADR-001 docsとskillsの正本

## 背景

設計規則がdocsとlocal skillsへ重複し、更新先と優先順位が曖昧です。

## 決定

`docs/`を仕様と設計理由の正本、local skillsをprocedure、`AGENTS.md`を短いcontractとします。
`.agents/local-skills`はskill artifactの編集元、`.agents/skills`はNix生成物です。
acceptedはmaintainerの承認状態を表し、main上にあるときだけ有効です。
詳細な配置と優先順位は[知識管理と正本](../architecture/knowledge-management.md)に定義します。

## 理由

人間とagentが同じ正本を参照でき、skillの発火有無で仕様が変わらないためです。

## 検討した代替案

- skillsを正本にする: 人間が一覧しにくく、長期仕様に不向き
- AGENTS.mdへ全て書く: contextが肥大化し、path-specific ruleが読みにくい
- docsとskillsへ同じ本文をcopyする: driftを再発させる
- `docs/agent`を`docs/product-agent`へ即時改名する: 意味は明確になるが既存linkの変更量が大きい

## 結果

`docs/agent`は製品Agent、`docs/architecture/codex-harness.md`はcoding agentという区別をindexへ
明記し、path renameは必要性が増えるまでdeferします。

## 強制方法

- skillは必読文書を必須化
- docs本文のcopyをreviewで拒否
- `.agents/skills`直接編集を禁止

## 検証

この判断専用のリポジトリ固有検査は置きません。
