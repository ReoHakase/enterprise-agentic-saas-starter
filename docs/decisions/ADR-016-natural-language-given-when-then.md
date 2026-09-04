---
id: ADR-016
title: テストと作業契約を自然言語のGiven-When-Thenへ統一する
status: accepted
date: 2026-08-23
owners:
  - repository-maintainers
related:
  - ../testing-strategy/common/test-case-design.md
  - ../architecture/issue-pr-authoring.md
  - ../architecture/coding-agent-workflow.md
  - ./ADR-003-test-command-and-cost-model.md
  - ./ADR-007-workspace-testing-strategy.md
---

# ADR-016 テストと作業契約を自然言語のGiven-When-Thenへ統一する

## 背景

このリポジトリはVitest、Storybook、Browser Mode、Playwrightを使い、ワークスペースごとに
異なるテスト層を持ちます。既存のテスト戦略は最低十分な層を定めていますが、シナリオの分割、
ライブラリ既定動作との境界、テスト名とcommentの言語、Issueからテストへの対応方法は統一して
いませんでした。

その結果、同じ失敗原因をcomponent testとStorybookで繰り返す、静的なstoryへassertionだけの
`play`を置く、独立したprotocol規則を1つのテストへまとめる、ライブラリの入力空間を再検査する
といった保守費用が生じます。IssueとPRでも、要求振る舞い、予定するテスト、実行結果が同じsectionへ
混在し、実装前後の判断を追跡しにくい状態でした。

## 決定

- 全テスト層のシナリオ設計を自然言語のGiven-When-Thenへ統一する。
- `Given`は必要な前提、`When`は結果を引き起こす振る舞い、`Then`は観測可能な結果を所有する。
- BRIEFを併用し、1シナリオを原則1規則、自然言語は通常5行以内にする。
- Given-When-ThenはIssue、PR、テスト名、構造comment、Storybook `step`を対応させるために使う。
- Gherkinのfeature file、step definition、Cucumber、テストコード生成は導入しない。
- 既存のVitest、Storybook、Browser Mode、Playwrightを実行可能な契約の正本として維持する。
- 各規則へ最低十分な所有層を1つ割り当て、上位層にはランタイム固有の代表配線だけを残す。
- ライブラリは、リポジトリが選んだ設定、adapter、公開契約、安全性、ランタイム差だけを検査する。
- test名、table case名、`step`、説明commentは日本語常体とし、文末句読点を付けない。
- 新規または変更したシナリオから適用し、既存テスト名の一括翻訳は行わない。

## 理由

- 要求、テスト名、コードの前提・振る舞い・結果を同じ語彙で追跡できる。
- UIのrenderや事前状態をtechnical phaseへ分類するより、何を起こし何を観測するかへ集中できる。
- BRIEFと所有層の対応表により、独立した規則の同居と上位層の重複をreviewで発見できる。
- native test runnerを維持するため、step definitionと本体コードの二重保守を増やさない。
- ライブラリ更新時に、内部実装ではなくリポジトリが依存する互換契約だけを確認できる。

## 検討した代替案

- GherkinとCucumberからテストを生成する: feature file、step definition、native testの対応を保守する
  必要があり、このリポジトリの多様なテスト層へ追加の実行面を作るため採用しない。
- ランナーごとに異なる記述規則を持つ: 同じ要求がVitest、Storybook、Playwrightで異なる語彙になり、
  Issueから所有層を選びにくいため採用しない。
- 自然言語構造を定めずcode reviewだけで分割する: agentと人間の判断基準を再利用できず、同じ
  過剰テストを繰り返すため採用しない。
- 全既存テストを一括変換する: 振る舞いを変えない大量renameがreviewと履歴を汚し、規則の整理と
  言語変更を区別できないため採用しない。

## 結果

新しいテストと変更するテストは、Given-When-Thenで説明できる構造、BRIEFな名前、日本語の
構造commentを持ちます。複雑な前提、複数の独立規則、ライブラリの既定動作、上位層の重複は、
テスト対応表を作ってから実装または整理します。

Issue FormsとPR templateには`要求振る舞い`と`テスト設計`が追加されます。Issueは予定、PRは実装後の
契約と現在のheadで得た検証結果を所有します。

Gherkin構文の機械検査やコード生成は行わないため、自然言語の品質と層の妥当性はreviewが必要です。
既存テストは段階移行となり、しばらく英語titleと新規の日本語titleが混在します。

## 強制方法

- `docs/testing-strategy/common/test-case-design.md`をテストケース設計の正本にする。
- `docs/architecture/issue-pr-authoring.md`をIssueとPR本文の正本にする。
- rootの`AGENTS.md`と関連local skillから両文書へroutingする。
- GitHub Issue Formsで`要求振る舞い`と`テスト設計`を必須入力にする。
- PR templateで実装後の振る舞い、テスト設計、確認結果を分離する。
- 大きな規約変更は、前回を知らない新しいagentによる経験的評価を行う。

## 検証

- Vitest、Storybook/Browser Mode/Playwright、Issue/PRの3場面を固定checklistで評価する。
- 各場面で所有層、ライブラリ境界、安全性、Given-When-Thenの対応を確認する。
- Issue Form YAMLをparseし、必須fieldとlabelを確認する。
- local skillを一時rootへNixで同期し、frontmatterと必読linkを確認する。
- `bun run check`、`nix flake check`、`git diff --check`を実行する。
