---
id: ADR-001
title: docsとskillsの正本
status: proposed
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

## 理由

人間とagentが同じ正本を参照でき、skillの発火有無で仕様が変わらないためです。

## 検討した代替案

- skillsを正本にする: 人間が一覧しにくく、長期仕様に不向き
- AGENTS.mdへ全て書く: contextが肥大化し、path-specific ruleが読みにくい
- docsとskillsへ同じ本文をcopyする: driftを再発させる

## 結果

Docs metadata、link check、skill validationが必要になります。

## 強制方法

- skillは必読文書を必須化
- docs本文のcopyをreviewで拒否
- `.agents/skills`直接編集を禁止

## 検証

- docs metadata/link check
- skill 必読文書 check
- duplicate heading/isolated docs check
