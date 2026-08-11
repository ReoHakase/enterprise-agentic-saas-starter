---
id: ADR-014
title: pre-commitのworkspace別Vitest related選択
status: accepted
date: 2026-08-11
owners:
  - repository-maintainers
related:
  - ADR-007-workspace-testing-strategy.md
---

# ADR-014 pre-commitのworkspace別Vitest related選択

## 背景

pre-commitはcommit message、format、lintを短時間で検査し、testはpre-pushの`bun run check`と
PR・`main`の全件testで実行している。workspaceごとにVitest config、unit project、coverage閾値が
分かれているため、rootから単一のVitest commandへstaged fileを渡すとworkspaceのtest境界を
正しく扱えない。一方、commitごとに全workspaceのunit・integration testを実行すると、変更と無関係な
testの起動が開発フィードバックを遅くする。

## 決定

pre-commitに限り、`scripts/test-related.ts`がstaged fileをworkspaceごとにまとめ、各workspaceの
Vitest configから`vitest related --run --coverage=false`を実行する。root test、Nodeのunit・integration
test、Web/UIの`unit` projectを対象にし、browser、E2E、paid model testは対象にしない。

Vitest config、package manifest、setup、DBの`forceRerunTriggers`、または存在しない削除fileが含まれる
workspaceは、relatedの静的import選択を使わず、そのworkspaceのunit suiteを
`vitest run --coverage=false`で実行する。docs、workflow、lockfileなどVitestへ静的な関連がない
fileだけの変更では、test commandを起動しない。

pre-pushの`bun run check`、PR、`main`の全件test、rootの公開test scriptは変更しない。commit-msgの
commitlintもcommit message検査に限定する。

## 理由

- Vitestのrelated commandが静的importを基準に関連testを選べるため、staged変更へ直接対応できる。
- workspaceごとのconfigとunit projectをそのworkspaceのcwdで実行することで、alias、setup、test includeを
  root configへ複製しない。
- subset testへcoverage閾値を適用すると、選択されたtestだけでは全体thresholdを満たせないため、coverageを
  無効にする。coverageはpre-push、PR、`main`の全件testで維持する。
- selectorの不確実性をfull unit suiteへの縮退で扱い、testを黙って省略しない。

## 検討した代替案

- rootから単一の`vitest related`を実行する: workspace別config、Web/UIのproject、transform設定を正しく
  継承できないため採用しない。
- pre-commitでrootの`bun run test`を全件実行する: 安全だが無関係なworkspaceの起動時間を毎回負担するため
  採用しない。pre-pushとPR・`main`の全件testは維持する。
- 各workspaceのLefthook commandを個別に定義する: configの重複とstaged fileの変換を増やすため、rootの
  小さな内部scriptへ集約する。
- browser、E2E、paid testもrelated選択する: 実行環境、費用、起動条件がunit・integration testと異なり、
  pre-commitの短時間契約を壊すため採用しない。

## 結果

通常のcommitでは変更に関係するtestだけが先に実行され、configや削除の変更ではworkspace全体のunit
suiteが安全側へ選択される。静的importで追跡できないdynamic importや実browser・全構成の回帰はrelated
選択の保証外だが、pre-push、PR、`main`の全件testが検出経路として残る。subset testでcoverage artifactを
生成しないため、coverage reportの正本は全件testに限定される。

## 強制方法

- `lefthook.yml`のpre-commitから`bun scripts/test-related.ts {staged_files}`を呼ぶ。
- `scripts/test-related.test.ts`でworkspace grouping、unit project、fallback、非対象file、失敗時の停止を固定する。
- `docs/architecture/quality-enforcement.md`と`docs/testing-strategy/common/ci-execution.md`でlocal hookと
  PR・`main`の全件testの境界を説明する。
- `bun run check`とCIのquality laneは全件test契約を維持する。

## 検証

- root、API、Web、UIの代表source fileから生成されるrelated command
- config、manifest、setup、DBのforce-rerun trigger、削除fileのunit suite fallback
- browser-only、E2E、TypeScript config、docs、workflow、lockfileの非対象判定
- `bun run check`
