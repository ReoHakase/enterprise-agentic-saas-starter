---
id: ADR-003
title: test commandとcost layer
status: proposed
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
---
# ADR-003 test commandとcost layer

## 背景

Unit、browser、E2E、paid LLMが混ざると、通常確認が遅くなりpaid実行を避けにくくなります。

## 決定

Root test scriptを`test`、`test:browser`、`test:e2e`、`test:eval:agent`、`test:e2e:agent`へ限定し、runtimeとcostで分けます。

## 理由

最も低いdeterministic layerへ保証を置き、real browserとpaid LLMを配線確認へ限定するためです。

## 検討した代替案

- layerごとに多数のscript: interfaceが増え、実行漏れが起きる
- 全て`test`へ含める: 日常実行が重くなる
- 全てE2E: 遅くflakyで原因分離が難しい

## 結果

Selector、path mapping、base SHA処理が必要になります。

## 強制方法

- root script contract
- CI job separation
- paid secretをfork PRへ渡さない

## 検証

- local/full/affected execution test
- selector fixture
- paid suiteが通常PRから分離されること
