---
id: ADR-002
title: layerとimport boundary
status: proposed
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
---
# ADR-002 layerとimport boundary

## 背景

Directory名だけではdependency directionを保証できず、deep importとframework leakageが発生します。

## 決定

`domain`、`application`、`port`、`adapter`、`repository`、`transport`、`controller`、`view`を共通概念とし、workspace/packageごとのpublic entrypointとOxlint/architecture checkで強制します。

## 理由

重要なbusiness ruleをframeworkから隔離し、refactorの影響範囲を狭めるためです。

## 検討した代替案

- 全workspaceを同じClean Architecture tree: runtime差を無視しceremonyが増える
- directory規則だけ: importで簡単に破れる
- lintだけ: 理由が分からずoverrideが増える

## 結果

Composition codeとpublic entrypointが増えます。小さいfeatureはflat structureを許可します。

## 強制方法

- package exports
- Oxlint `no-restricted-imports`、`import/no-cycle`
- Knip strict
- architecture check

## 検証

- forbidden import fixture
- package graph check
- production bundle inspection
