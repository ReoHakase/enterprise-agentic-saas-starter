---
id: ADR-014
title: pre-commitのVitest Test Projects選択
status: accepted
date: 2026-08-12
owners:
  - repository-maintainers
related:
  - ADR-007-workspace-testing-strategy.md
---

# ADR-014 pre-commitのVitest Test Projects選択

## 背景

pre-commitはコミットメッセージ、整形、静的検査を短時間で検査し、テストはpre-pushの
`bun run check`とPR・`main`で全件実行している。ワークスペース単位で`related`を実行すると、共有
パッケージの変更から利用側アプリケーションのテストへ至る静的`import`を追跡できない。複数
ワークスペースを同時に変更した場合はVitestプロセスも重複し、同じテストを複数回選択する可能性がある。

root configが各ワークスペースのVitest configをimportまたはconfig pathとして参照すると、関連テスト選択が
Browser Modeや各ワークスペース固有pluginの依存と初期化へ結合する。関連テスト選択のgraphはrootが所有し、
ワークスペース固有の全件・coverage・browser設定から独立させる必要がある。

## 決定

`lefthook.yml`の単一コマンドが`{staged_files}`をリポジトリルートの
`vitest related --config vitest.config.ts --run --coverage=false`へ渡す。コマンド内で`git diff`、`jq`、
独自selector、workspace別Vitest起動を使わない。Lefthook側でも対象workspaceやtest種別を`glob`と
`exclude`で分類せず、全staged pathに対する選択をVitestへ委ねる。

既存のroot `vitest.config.ts`をVitest標準のTest Projectsとして常時使い、リポジトリルート、各Node
ワークスペース、Web/UIの単体テストprojectを自己完結して定義する。root configは`apps/**`または
`packages/**`のconfig moduleをimportせず、config pathとしても登録しない。関連選択に必要なproject root、
test名、Web/UIのinclude、setup、alias、JSX変換だけをrootで所有する。各ワークスペースの既存configは
通常の全件テスト、coverage、Browser Modeの正本として独立して維持する。新しいconfigファイルや選択
scriptは追加しない。

rootの`forceRerunTriggers`へマニフェスト、Vitest/Vite設定、setup、`tsconfig.json`、DB
マイグレーション、スキーマ、Drizzle設定を明示する。これらの変更ではTest Projectsに登録した全Node
テストを実行する。Browser Mode、Storybook、E2E、有料モデルテストは登録しない。

削除ファイルを検出する別処理や全件fallbackは設けず、他のstaged fileと同じく削除後のpathをVitestへ
渡す。現在ツリーに存在しないmoduleはVitestの静的依存graphから関連付けできず、関連テストが0件になる
場合がある。この制約はpre-pushの`bun run check`、PR、`main`の全件テストで補完する。

リポジトリルートの`bun run test`はroot Test Projectだけを明示選択した後、Turbo経由で各workspaceの
テストを実行する。これにより、workspaceごとのcoverage設定と閾値を維持したまま全件テストを続ける。
commit-msgのcommitlintはコミットメッセージ検査に限定する。

## 理由

- Vitestの`related`が1つのTest Projects graphを使うため、共有パッケージから利用側のテストまで
  ワークスペースをまたいで選択できる。
- 全staged fileを1つのVitestプロセスへ渡すため、Lefthookコマンドごとの重複起動と重複選択を作らない。
- rootが関連選択用projectを自己完結して所有するため、workspace configのexport、plugin、coverage、
  Browser Modeをrootの起動契約へ持ち込まない。
- Test Projectではprojectごとのcoverage設定を持てないため、全件テストはTurbo経由のworkspace別実行を
  維持し、既存のcoverage閾値を変えない。
- 部分テストへカバレッジ閾値を適用すると全体閾値を満たせないため、関連実行ではカバレッジを無効にする。
- 設定変更の不確実性はVitest標準の`forceRerunTriggers`で扱い、選択ロジックをshellへ複製しない。

## 検討した代替案

- rootから各workspaceのVitest configまたはproject factoryをimportする: rootの関連選択がworkspace固有の
  pluginとconfig初期化へ依存し、所有方向が逆転するため採用しない。
- rootのTest Projectsへworkspace config pathを登録する: Web/UIのBrowser Mode、Storybookを含む通常設定を
  関連実行へ混ぜ、test fileを重複登録するため採用しない。
- Lefthookからworkspace別に`vitest related`を実行する: 共有パッケージから利用側への依存を追跡できず、
  複数変更でVitestプロセスとテスト選択が重複するため採用しない。
- shellまたは内部scriptで削除、workspace、fallbackを分類する: Vitestが持つTest Projectsと依存graphの
  外側に第二の選択規則を作るため採用しない。
- `vitest run --changed`だけを使う: staged fileだけでなくunstaged fileも選択するため、pre-commitの
  staged-only契約に合わず採用しない。
- Browser Mode、E2E、有料テストも`related`で選択する: 実行環境、費用、起動条件が単体・統合テストと異なり、
  pre-commitの短時間契約を壊すため採用しない。

## 結果

通常のコミットでは変更に関係するテストを全Test Projectsから1回だけ選択し、トリガー変更では全Node
テストを実行する。静的graphへ接続できない削除path、計算された`import(filepath)`、実ブラウザー、全構成の
回帰は関連選択の保証外だが、pre-push、PR、`main`の全件テストが検出経路として残る。部分テストで
カバレッジ成果物を生成しないため、カバレッジ報告の正本は全件テストに限定される。

## 強制方法

- `lefthook.yml`からroot configを使う単一の`vitest related`だけを呼ぶ。
- root `vitest.config.ts`で自己完結したTest Projectsと`forceRerunTriggers`を定義する。
- root configから`apps/**`と`packages/**`のconfig moduleをimportまたは参照しない。
- `docs/architecture/quality-enforcement.md`と`docs/testing-strategy/common/ci-execution.md`でlocal hookと
  PR・`main`の全件testの境界を説明する。
- `bun run check`とCIのquality laneは全件test契約を維持する。

## 検証

- Test Projectsのtest file一覧に重複、Browser Mode、Storybook、E2Eがないこと
- 共有パッケージの代表sourceから利用側を含むTest Projectsの`related`選択
- Web/UIの代表sourceに対する単体テスト選択
- マニフェスト、設定、setup、`tsconfig.json`、DBの`forceRerunTriggers`
- 存在しないpathがVitest標準の0件成功になること
- root configにworkspace configのimportまたは参照がないこと
- Lefthookの関連テストcommandに`git diff`、`jq`、独自scriptがないこと
- Lefthookに関連テスト用のworkspace `glob`または`exclude`がないこと
- `bun run check`
